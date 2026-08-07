# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status of this repository

The production foundation has shipped, event context and the session catalog shipped on top of it
(feature 002, [#6](https://github.com/Programa-Semilla/mynet-ps/pull/6)), Agenda became a personal
schedule rather than a read-only programme (feature 005, squash-merged to `develop` in
[#8](https://github.com/Programa-Semilla/mynet-ps/pull/8)), and **a person can now become an
attendee under their own power, describe themselves, and leave** — feature 004.

An attendee **creates their own account**, joins a conference with its code, and arrives at the
conference happening now, greeted by name and told which day of it today is in the venue's
timezone. Home shows what is next, what remains of the day, and **what
is next from the sessions they chose**. Agenda carries the whole programme with an All/Saved filter,
a save control on every session, and an addressable **session detail panel** with overview, speaker
info and durable **personal notes**. The conference switcher is in the top bar at all three widths,
and the choice survives sign-out and a change of device.

Four things 005 established that every later feature inherits:

- **The agenda is readable offline.** A caching decorator sits at the repository boundary — no
  component knows it exists — keyed `(attendeeId, eventId, resource)` with a **24-hour lifetime**.
  Every cached surface states when it was retrieved. Writes are **refused, never queued**: no write
  queue, no optimistic update, no conflict merging. Offline, the age limit is the only thing that
  revokes access, which is why it is a requirement rather than a tuning value.
- **A destination owns its element and its nested addresses.** `routes.tsx` no longer names any
  address literally; Agenda declares its own element and its `:sessionId` child in `navigation.ts`.
  006–009 extend that file, not the router.
- **The detail panel is the product's first real modal**, a native `<dialog>` with `showModal()` —
  so the focus trap, background inertness and Escape come from the platform. Focus restoration to
  the opener is explicit, because `<dialog>` does not do it reliably. It is structured as separate
  sections so 009 can add audience questions without editing either of them.
- **`CatalogRepository` is read-only in perpetuity**, asserted by name-shape over its exported
  surface: attendee state *about* conference content belongs in its own repository, never on the
  catalog.

Three things 002 established that every later feature inherits:

- **The event scoping predicate is enforced server-side** — a branded `EventScope` that only
  `requireEventAccess` can construct, which every per-event query demands, plus a route audit that
  fails when a route declaring an event parameter lacks the guard, plus a lint rule closing the
  brand's type-assertion escape hatch.
- **Home is a card registry.** `apps/web/src/app/home/registry.ts` is append-only and is the one
  shared file the next seven features touch; each contribution is one line and its own file.
- **Three shared files were split per domain** so later features append rather than edit:
  repository interfaces, API route registration, and the seed.

Five things 004 established that every later feature inherits:

- **A person becomes an attendee by signing themselves up**, and every consequence of that is now
  built: email verification, password recovery, account deletion, personal-data export, and
  withdrawal from a single conference. There is still no organizer, no privileged role and no
  administrative interface — a join code on a seeded row is seed data, not an administrator.
- **Two structural guards fail a *future* feature's build**, and they are the reason 006–009 cannot
  quietly regress the personal-data commitments. `tests/unit/deletion-coverage.test.ts` fails when a
  table storing attendee data has neither a cascade from `attendees` nor a declared retention rule;
  `tests/unit/export-coverage.test.ts` fails when a column is collected without export coverage.
  Both derive their expectations from the Drizzle schema, so **a new table or column fails by
  existing**. Adding one to an allow-list requires writing down why.
- **Two new ports, both server-side.** `StorageService` (durable binary content) and `MailService`
  (transactional account mail, two methods, no generic `send`). Both have implementations needing no
  provisioning, so register entries 11 and 18 block production rather than development. A lint rule
  keeps storage vendors — and today's backing table — out of everything but `apps/api/src/storage/`.
- **Throttling is per action.** `sign_in_attempts.action` separates five counters, and reset-request
  is configured so it **may delay but can never deny** — the person an identifier-keyed denial harms
  is always the victim. 001's no-lockout guarantee rested on verifying the credential before
  consulting the throttle, and three of the new actions have no credential to verify first.
- **Verification gates exactly one thing: discoverability.** An unverified attendee uses the product
  fully and appears to nobody. **006 may assume every profile it can read carries a verified
  address** (FR-325c) — verification is a precondition of being readable at all, so a directory
  never has to check it, and no later feature may rely on verification state for anything else.

**Still carrying no product content**: Discover, Messages and Network. No attendee cards, no
threads, no appointments. Audience Q&A arrives in 009, as a third section on the panel 005 built.
006 is what reads the profiles 004 authors; `GET /events/:eventId/attendees/:attendeeId` already
exists and applies all three visibility conditions in one query.

**005 stored the product's first attendee-authored free text** — personal session notes — on a
narrow declared retention commitment: deleted with the account, **no export path**. That commitment
was superseded by v2.3.0 and is now **fully discharged**: 004's `DELETE /account` is what finally
gives 005's cascade something to fire, and `GET /profile/export` is the export path it lacked.

**One record is deliberately not deleted with an account**: `sign_in_attempts`. It has no foreign
key by design, and removing a departing attendee's rows would let an attacker clear their own trail
by registering and deleting an account. It expires on the existing two-hour sweep instead, which
FR-382 forbids lengthening — an earlier draft of 004's spec assumed 90 days and would have
*lengthened* retention of pseudonymous data forty-fold.

**004 shipped on 2026-08-07**, unblocked by brainstorm #04 and ratified in constitution **v2.3.0**.
It claimed migration **`0003`** — exactly one, as reserved — which is why the journal lists `0003`
before `0004` while carrying a later timestamp; `apps/api/migrations/meta/README.md` explains why
both halves are load-bearing and what a regenerating feature must not "fix". 006 is next. See
`brainstorm/00-overview.md` for the queue.

**004 now departs substantially from the delivery roadmap**, and its specification must say so. The
roadmap scopes it as profile fields plus an edit surface, treating the identity model as an input.
As decided it also carries self sign-up, event join by code, email verification, password recovery, a
transactional mail provider, avatar upload behind a new `StorageService`, account deletion, personal-
data export, a retention purge, and a discoverability toggle. A phase split is the first thing to
settle once the spec exists.

```
GroundZero/
  README.md        # Initialization brief + tech-stack recommendation
  requirements.md  # Product requirements (read for WHAT, not HOW — see below)
  prototype/       # Approved Figma Make prototype (reference only)
apps/
  api/             # Fastify + Drizzle over managed PostgreSQL; versioned migrations
  web/             # React + TypeScript PWA; shell, sign-in, five destinations
packages/
  data/            # Repository interfaces + HTTP implementations + generated contract types
  platform/        # The six device-capability interfaces + web implementations
  config/          # Shared TypeScript and Vitest bases
contracts/         # Generated, committed OpenAPI contract
e2e/               # Playwright end-to-end tests
brainstorm/        # Design sessions and their decisions
specs/             # Feature specifications
docs/superpowers/  # Design documents and implementation plans
```

Project governance lives in `.specify/memory/constitution.md` (**v2.3.0**). It is authoritative for
how work is done here and supersedes tool defaults, habit, and any conflicting statement in this
file.

The **delivery roadmap** — `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md` —
is the authoritative decomposition of the remaining product into features, with their dependency
order, reserved migration numbers, and gate schedule. Read it before starting any new feature. It is
a plan rather than governance: it may be revised without a constitutional amendment, but a feature
that departs from it must say so in its specification.

### Standing decisions (project owner)

These were decided explicitly and are **not** open for re-inference.

**2026-08-04:**

1. **The product is MyNet.** Not EventLink.
2. **MyNet is the real product, not a demo.** The front-end-demo framing is withdrawn.
3. **`requirements.md` is authoritative for WHAT the product is, not HOW it is delivered.**
4. **Durable persistence is foundational** — a project-owned API over managed PostgreSQL.
5. **Real authentication is foundational**, not a later addition.
6. **The five destinations are individually addressable** (each has its own URL).

**2026-08-06:**

7. **Event scoping is hybrid.** Conference content — sessions, tracks, speakers, the Discover
   directory, appointments — is per-event and swaps on switch. Relationships — contacts, exchanged
   cards, message threads — persist across every event. Every new table declares which rule applies
   and why; neither is a default.
8. **Conference content is seeded; profiles are attendee-authored.** Events, sessions, tracks,
   rooms, and speakers ship as committed seed data. Each attendee authors their own profile and no
   one else's. No administrative interface and **no content import path** — both would be organizer
   administration, which stays out of scope.
9. **Home is composed, not aggregated.** Home is a registry of independent cards; each owns its
   loading, empty, and failure states; a failing card must not blank the dashboard; no card depends
   on another's presence or data. Features contribute a card, never edit another feature's card.
10. **Features run mostly sequentially**, in parallel only where they touch disjoint files.

**2026-08-07** (brainstorm #04, ratified in constitution v2.3.0) — these close the three entries that
blocked 004:

11. **A person becomes an attendee by signing themselves up.** Self-serve account creation — email,
    display name, password — and registration for a conference by entering an access code carried on
    the seeded event row. This does **not** breach the organizer exclusion, and the reasoning is not
    to be re-derived: of the four candidate models, *event invitation* and *organizer-provisioned*
    both need an issuer who is not an actor here, and *ticket holder* needs an integration nobody has
    decided on. Self sign-up is the only model leaving the attendee as sole actor. Password recovery
    is consequently in scope.
12. **Retention, deletion and export are self-serve and complete.** Hard deletion with cascade and no
    tombstone; machine-readable export covering every field collected; a retention clock for
    personal-data records no cascade can reach (`sign_in_attempts` has no foreign key, by design).
    Built to the strict standard so that settling jurisdiction is not a precondition.
13. **Attendee avatars are uploaded.** Resizing and **EXIF stripping are mandatory** — phone
    photographs carry GPS coordinates. The prototype's Unsplash photographs are of real people and
    must not ship as seeded attendee faces.
14. **Transactional account mail is in scope**, distinct from the excluded engagement notifications.
15. **Image bytes go through a `StorageService`** platform interface — a seventh alongside the six
    device capabilities — never a storage SDK called from feature code.
16. **A profile is visible to co-attendees at the same event**, enforced server-side by the existing
    event-scoping predicate, with one discoverability toggle. All-or-nothing by design; per-field
    permissions were considered and rejected.

## Branching and change flow

`main` and `develop` are protected. **Never commit or push directly to either.** Every change
goes through a pull request.

- Branch from `develop`, named `<type>/<short-description>` (`feat`, `fix`, `chore`, `docs`,
  `spec`, `refactor`).
- Open the PR against `develop`; merge with **squash** and delete the branch.
- Promoting `develop` → `main` is also a PR.

Activate the local guardrails once per clone:

```bash
git config core.hooksPath .githooks
```

`.githooks/pre-commit` and `.githooks/pre-push` block direct commits and pushes to `main` and
`develop`. They are bypassable with `--no-verify` — server-side GitHub branch protection is **not
configured**. The protection endpoints return 404 (no rule set), not 403; the repository is public
and organisation-owned, and protection is free on public repositories, so this is a configuration
task rather than a limitation. See `.githooks/README.md`.

## Product

**MyNet** — a multi-event attendee engagement and professional networking platform. It **is** an authenticated attendee workspace, not a marketing site and not a generic enterprise dashboard.

It answers three questions for the attendee, in this order of prominence:

1. What is happening next?
2. Who should I meet?
3. Where are my conversations, notes, and appointments?

Success is defined as: a viewer understands the product within the first viewport and can complete the core journey — inspect the next session → discover a relevant attendee → share a card or message them → schedule a networking appointment.

## Actors

The **attendee** is the only actor in the current scope. Speakers and other attendees appear as data the attendee interacts with, not as users of the system.

Organizer administration is explicitly out of scope for this version.

## Capabilities and workflows

Five primary destinations: **Home, Agenda, Discover, Messages, Network**. Home is the entry view and is built around the attendee's active event.

- **Home** — event switcher (active event + location), attendee greeting with day context, prominent "Up next" session card (time, room, speaker, join/view action), compact rest-of-day timeline, recommended people to meet, appointment summary, unread-message indicator.
- **Agenda** — personalized schedule in chronological order; sessions show time, track, room, speakers, saved state; add/remove sessions; open a session detail panel with Overview, personal Notes, audience Q&A with upvoting, and Speaker info.
- **Discover** — information-rich attendee cards; search plus role/interest filters; each profile exposes company, role, interests, networking intent, availability; actions are open profile, share digital business card, start a message, schedule a meeting.
- **Messages** — conversation list plus a focused thread; switch conversations, compose and send messages. Message content is private to its participants.
- **Network** — saved contacts, exchanged digital cards, and scheduled appointments. Meeting scheduling is a compact modal with selectable time slots and a short topic field; confirming creates an appointment and shows clear success feedback.

Saved sessions, notes, Q&A votes, conversations, cards, and appointments are **durable, per-attendee, server-side state** — not local component state. The prototype's local-only behaviour is a prototype artifact.

## Domain terminology

- **Event** — a conference the attendee is registered for; has name, location, and day N of M. Multiple events are switchable.
- **Session** — a scheduled item with time, title, room, track, and optional speaker.
- **Track** — a session category, visually coded (Design, Product, Tech, Keynote, Main Event in the prototype data).
- **Saved session** — a session added to the attendee's personal Agenda.
- **Attendee / profile** — a person with company, role, interests, networking **intent** (e.g. "Open to meetings"), and **availability** (available / busy).
- **Digital business card** — shareable contact payload; sharing produces a confirmation state.
- **Appointment / networking meeting** — a confirmed time slot with another attendee plus a short topic.
- **Conversation / thread** — the message history with one attendee.
- **Q&A** — audience questions on a session, with upvotes.
- **Up next** — the attendee's next session, given first-viewport prominence.

## Business rules and constraints

### Reading `requirements.md`: WHAT binds, HOW does not

`requirements.md` describes the product through the lens of the original demo prototype. Per the
owner decision, classify every statement before relying on it:

| **WHAT — binding** | **HOW — superseded** |
|---|---|
| Actors, capabilities, five destinations, workflows | "single-route, front-end product demo" |
| Domain terminology and visual direction | "without external services, authentication, or durable storage" |
| Accessibility and responsive obligations | "data live in focused in-file constants" |
| Required empty and error states | "No network request is required" |
| The core journey and success criteria | "Browser reloads reset state, which is acceptable" |
| Product exclusions (organizer admin, payments) | "Not included: persistent databases, real authentication" |

### Constraints

- **Real product with durable server-side state.** Project-owned API over managed PostgreSQL, with real authentication. Schema changes are versioned, reviewed migrations committed to the repository.
- **Attendee data is personal data.** Every record is attributable to one identity; every read path is scoped by identity; authorization is enforced server-side, never by client-side filtering. Secrets never reach the client bundle. See constitution Principle VIII.
- **Still out of product scope**: organizer administration and payment processing. **Engagement** notification delivery and calendar integration stay out until a recorded decision brings them in — their interfaces exist but must not be wired to real delivery, and the notification bell must not be reproduced. **Transactional account mail is in scope** (v2.3.0): address verification and password reset, and nothing else. Seed data must not become a route around the organizer exclusion: no admin interface, no privileged role, no content import path.
- **Deletion and export are per-feature duties** (v2.3.0). Deletion is self-serve, hard, and cascading — no soft delete, no tombstone. Export is self-serve and machine-readable and must cover every field collected. Personal-data records no cascade can reach must expire on a stated clock. Every feature storing attendee data declares how its records are covered, in the change that introduces them.
- **Event scoping is hybrid** (standing decision 7). Conference content is per-event; relationships persist across events. Every new table states which rule applies and why. The predicate is enforced server-side, alongside identity binding — an attendee must not reach another event's content by manipulating a request.
- **Home is composed, not aggregated** (standing decision 9). Contribute a card; never edit another feature's card.
- **Data access goes through repository interfaces.** Components never call the network or know transport details. See constitution Principle V.
- **Every feature declares its own completeness** (constitution Principle IX). Offline behaviour, all three layouts, empty/loading/failure states, accessibility, checklist items discharged, identity scoping, event scoping, register position, and reserved migration number — declared in the spec, or presumed unmet. None of these may be deferred to a later polish pass.
- Loading and failure states are required wherever data crosses the network, alongside the empty states below.
- Every interactive control has an accessible label, a visible focus state, and keyboard support. Modals need a clear close action and Escape-key behavior where practical.
- Responsive: desktop = persistent left navigation rail, contextual top bar, multi-column dashboard; tablet = reduced rail, two-column cards, stacked detail; mobile = compact header, bottom navigation, single-column cards, full-width overlays, touch-sized controls. **No content or primary action may require horizontal scrolling.**
- Required empty/error states: no attendee search results (message + reset-filter action), no saved sessions (invitation to explore), empty thread (conversation-starter prompt), no meeting slots (explanation + close), invalid empty message or meeting topic (**disabled confirmation**, never a post-submit error).
- Visual direction: editorial conference aesthetic — deep navy surfaces, warm coral accents, soft cream backgrounds, white content cards, subtle mint status cues. Confident contemporary typography, restrained rounded corners, purposeful shadows. Must not read as a generic enterprise dashboard; people, sessions, and time are the strongest visual elements. Consistent icon set; decorative shapes subtle and geometric.
- Validation checklist for the **product as a whole**, satisfied incrementally as features land: production build success, desktop and mobile rendering, navigation and event switching, search/filter, session save + notes + Q&A, message composition, card-sharing feedback, meeting scheduling and appointment creation, keyboard focus visibility and accessible labels. Each feature states which items it discharges.

## Technology stack

`requirements.md` contains **no** technology-stack section, despite `GroundZero/README.md` naming it as the source for stack guidance. The recommendation lives at the end of `GroundZero/README.md`; the backend, database, and authentication decisions below are owner decisions recorded in the constitution, which supersedes that recommendation where they differ.

- **Client**: React + TypeScript as an installable PWA — manifest, app icons, offline shell, versioned caching, explicit online/offline states. Offline behaviour is specified **per feature**: what works offline, what does not, and what happens to an action attempted offline. Optimistic updates and conflict resolution require a recorded decision each.
- **Backend**: a project-owned API service over **managed PostgreSQL**. The API contract belongs to this project — not vendor-generated. Chosen over a managed BaaS for portability and contract control; the operational cost is accepted.
- **Authentication**: real, server-side session establishment and validation. Whether identity is self-owned or delegated to a provider is undecided.
- **Abstraction layers, both mandatory.** Device capabilities — `NotificationService`, `CalendarService`, `CameraService`, `ContactShareService`, `SecureStorage`, `ConnectivityService`. Data access — repository interfaces in domain terms. Application code calls neither browser APIs nor the network directly.
- **Linux-based CI**, no Apple infrastructure required: type checking, linting, unit tests, component tests, API contract tests, migration verification, integration tests against a real database, accessibility checks, end-to-end browser tests, production build, preview deploy on every change.
- **Add Capacitor only when** one of three triggers occurs: App Store distribution becomes mandatory; a required capability is not adequately available on the web platform; or field testing shows PWA installation materially harms adoption. Then use Codemagic/Bitrise for iOS builds, TestFlight, and Google Play internal testing.
- Test on at least one **physical iPhone** before production.
- Alternatives, ranked and conditional: React + Capacitor (store-enabled evolution) → React Native + Expo (app-store-first) → Flutter (rich UI/animation-defining) → .NET MAUI (strongly C#/.NET team only). Xamarin and Unity are not recommended.

## Role of the prototype

`GroundZero/prototype/` is an **approved visual and interaction reference, not production code.** Its architecture, implementation decisions, code quality, and internal structure carry no authority and should not be preserved by default. It is a Figma Make export.

What it is legitimately used for: interaction flows, screen composition, copy, sample data shape, and the visual language.

Observed characteristics — treat these as prototype artifacts to re-decide, not as decisions:

- Everything lives in one 1,400-line `src/app/App.tsx`: types, sample data (`EVENTS`, `SPEAKERS`, `SESSIONS`, `ATTENDEES`, `INITIAL_CONVERSATIONS`, `INITIAL_APPOINTMENTS`, `MEETING_SLOTS`), all screen components, and root state.
- All state is `useState` in the root `App` component, threaded down as props: `activeTab`, `activeEvent`, `savedSessions`, `notes`, `qaVotes`, `conversations`, `appointments`, plus overlay state for the session panel and meeting modal.
- Colors are hardcoded hex literals throughout (navy `#1b2340`, coral `#e8634d`, cream `#fdf8f3`, mint `#5CC9A7`, border `#efe8e1`, muted `#8f96a8`, body `#525a70`). Fonts are per-element `font-['Outfit']` / `font-['Geist']` classes loaded from Google Fonts.
- Icons are hand-inlined SVG, not an icon library — despite `lucide-react` and MUI icons being installed.
- `src/app/components/ui/**` is a full unused shadcn/ui scaffold; `App.tsx` imports none of it. `src/styles/theme.css` and `default_shadcn_theme.css` define shadcn tokens the app never uses. `src/imports/EventlinkMobileHome/index.tsx` is the raw Figma export and is also unused — only its five 1024×1024 avatar PNGs are imported.
- `package.json` carries a large dependency list inherited from the Figma Make template (MUI, recharts, react-dnd, react-slick, embla, react-router, …) that the app does not use.

### Running the prototype

From `GroundZero/prototype/`:

```bash
npm i          # install
npm run dev    # vite dev server
npm run build  # vite production build
```

There is no lint, test, or typecheck script, no `tsconfig.json`, and no lockfile. `react` and `react-dom` (18.3.1) are declared only as **optional peerDependencies**, so a clean install may not provide them. A `pnpm-workspace.yaml` is present, pinning Linux/x64+arm64/glibc.

## Authoritative sources, in priority order

1. **Recorded owner and client decisions** — `.specify/memory/constitution.md` and the decisions its amendments cite.
2. `GroundZero/requirements.md` — read for **WHAT**, per the table above.
3. Client-provided reference images — visual intent. **Not present in this repository**; the only images here are Unsplash avatar photos used as prototype sample data.
4. `GroundZero/prototype/` — approved interaction and presentation reference.
5. Existing source code — implementation reference only, unless explicitly confirmed as production architecture.

When sources conflict on a **WHAT**, **do not resolve by assumption.** Record the discrepancy as an open question and settle it with the client.

## Open questions and known discrepancies

Do not silently resolve any of these. The authoritative register is in
`.specify/memory/constitution.md`; this is a working summary.

**Resolved 2026-08-04 by owner decision** — do not reopen without an amendment: the product name
(MyNet), and demo scope versus persistence (MyNet is the real product with durable server-side
state).

**Resolved 2026-08-06 by owner decision** — likewise closed: **event scoping** (hybrid; see standing
decision 7), **attendee profile view** (a profile detail view ships with Discover), and **repository
shape** (the API lives here, at `apps/api`).

**Resolved 2026-08-07, ratified in v2.3.0** — the three entries that blocked 004, closed as client
and owner decisions. See standing decisions 11–16 above and the constitution's "Resolved in 2.3.0".
**Attendee identity model** (self sign-up with an event join code), **retention, deletion and export**
(full self-serve), and **avatar handling** (real upload).

### Require a client decision

Each entry names the feature it blocks, because when to ask matters as much as what to ask.

- **The connection model behind Network contacts.** The prototype derives contacts from the existence of a conversation. There is no connect or accept action, so there is no defined relationship to store. **Blocks the Network feature entirely.**
- **Exchanged digital cards.** Requirements place them in Network; the prototype shows a transient 2-second confirmation and records nothing. What a card exchange creates, and whether it is mutual, is undefined. **Blocks the Network feature entirely.**
- **Audience-question attribution.** Whether a Q&A question is attributed to its author or anonymous. It decides whether Q&A is a personal-data surface under Principle VIII. **Blocks the Q&A feature.**
- **Desktop and tablet layouts are unvalidated by the client.** The responsive shell exists, but the approved prototype is mobile-only: a fixed 390×844 phone frame with a simulated iOS status bar, centered on a navy page. Every desktop layout built before this is answered is unreviewed design, so the cost compounds with each feature.
- **Real brand mark and application icons.** No logo exists in this repository. Long lead time — it blocks release readiness rather than any single feature.
- **`requirements.md` is now knowingly out of step** with the constitution on product name, delivery mode, persistence, authentication, and routing. Whether it is amended or the divergence is simply recorded is undecided.
- **Notifications.** The prototype header shows a notification bell with an unread dot, but **engagement** notifications are out of product scope. The bell must not be reproduced until a decision brings notifications in. This does *not* cover transactional account mail, which v2.3.0 brought into scope.
- **What "PS" denotes** in the repository name `mynet-ps`.
- **Stack guidance is not where the brief says it is.** `GroundZero/README.md` designates `requirements.md` as authoritative for the technology stack, but `requirements.md` contains no stack section. The recommendation exists only in `README.md`.

### Require an owner or planning decision

- **API hosting, the managed PostgreSQL provider, and object storage.** The object-storage provider behind `StorageService` folds into this entry rather than standing alone. No feature is blocked on it — `StorageService` carries a local implementation for development, test and preview — but the production path is unproven until it is answered.
- **Authentication ownership** — self-implemented versus a delegated provider.
- **The transactional email provider.** v2.3.0 settled that account mail is sent — verification and password reset — not by whom. Needed by 004; brings one external dependency and one secret.
- **Nobody moderates uploaded avatar images.** Public self sign-up plus image upload, in a product with no administrative actor by construction, and the organizer-administration exclusion is exactly what forecloses the usual answer. Cheapest to settle before the first publicly reachable preview.
- **Attendee avatar handling** — seeded imagery versus real upload. Upload pulls in object storage and `CameraService` and opens a new personal-data surface. Deferring it is the working assumption, not a decision. **Blocks the attendee profile feature.**
- **Preview environments must never point at production data**, and preview access control is undecided. Cloudflare Pages previews are publicly reachable by default.
- **Server-side branch protection is unconfigured** — a configuration task, not a limitation. Corrected 2026-08-07: the repo is **public** and organisation-owned (`Programa-Semilla/mynet-ps`), and the protection endpoints return **404 (no rule set)**, not 403. Protection is free on public repositories. Enforcement is meanwhile client-side and bypassable — materially more serious now that real attendee data is in scope.
- **The repository is public**, and neither the constitution nor this file recorded that until 2026-08-07. It changes the Principle VIII threat model: seed data, migrations, workflow config and the API contract are world-readable, and previews are reachable by anyone who finds them.
- **The pipeline's correctness gates now all run; only the preview path is still unprovisioned.** Register entry 17 recorded that `migrations`, `test-integration`, `test-accessibility` and `test-e2e` had never executed once. Two changes closed that: 005 fixed `test-unit` (the route audit needed `DATABASE_URL` at module load), and [#9](https://github.com/Programa-Semilla/mynet-ps/pull/9) moved the four database gates onto **per-job `postgres:17` service containers** — they never needed a vendor, Principle VII asks for a real database rather than a particular one, and a per-job container isolates better than the shared branches it replaced. Run `31192787746` shows all four passing for the first time. **Still open**: `deploy-api` and `deploy-preview` need `FLY_API_TOKEN` and the three Cloudflare secrets, `schema-diff` and `db-branch` need `NEON_API_KEY` and `NEON_PROJECT_ID` plus a `preview-base` branch, and the aggregate `verify` check stays red until they exist — which is the honest signal for missing provisioning rather than something to work around (FR-071).

### Not open questions — settled requirements the prototype failed to meet

- **Escape-key and focus behavior.** Requirements ask for Escape handling on modals and visible focus states. The prototype implements neither: no key handling on the session panel or meeting modal, and inputs use `focus:outline-none` with only a border-color change. Constitution Principle IV settles this — it is a defect to fix, not a question to answer.
- **Hardcoded persona and date.** The prototype greets "Good morning, Sarah" on "Tuesday, March 18" regardless of event or actual time, and "Starts in 15m" is static text. With real authentication and real data these become the signed-in attendee and actual times. Prototype artifact, now moot.
