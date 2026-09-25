# CLAUDE.md

Working brief for Claude Code in this repository. **Short by design**: the constitution's Runtime
guidance forbids this file from carrying plans, session tasks or progress updates, and it must stay
consistent with the constitution. Depth lives in the sources below, which are authoritative over it:

1. **`.specify/memory/constitution.md` (v5.4.1)** — governance, binding constraints, and the Open
   Questions Register. Supersedes tool defaults, habit, and this file. Its amendment history (every
   Sync Impact Report, every original register entry) is `docs/record/constitution-history.md`.
2. **`docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`** — the decomposition into
   features, dependency order and gate schedule. A plan, not governance; a feature departing from it
   must say so in its spec.
3. **`specs/<feature>/`** — spec, plan, tasks, review findings, deviations.
4. **`GroundZero/requirements.md`** — read for **WHAT**, not HOW (table below).
5. **`GroundZero/prototype/`** — approved interaction and visual reference only.
6. Existing source — implementation reference.

**The record, moved out of this file on 2026-09-24 and preserved verbatim** — read the one that
covers what you are touching:

- `docs/record/architecture-invariants.md` — the full reasoning behind every invariant indexed below.
- `docs/record/standing-decisions.md` — the **numbered** owner decisions 1–56 that code comments cite
  as "decision N" (with its numbering collisions explained). Next free number: **57**.
- `docs/record/delivery-log.md` — feature-by-feature history through 2026-08-15, including
  invariants 010, 014 and 016 recorded there.

When sources conflict on a **WHAT**, **do not resolve by assumption.** Record it as an open question
and settle it with the client.

## Repository layout

```
GroundZero/       # Initialization brief, requirements.md, approved prototype (reference only)
apps/api/         # Fastify + Drizzle over PostgreSQL; versioned migrations
apps/web/         # MyNet: React + TypeScript PWA; shell, sign-in, five destinations
apps/admin/       # The SEPARATE administrative website (admin.<host>). No PWA, no service worker,
                  #   no @mynet/platform — its absences are structural, not configured.
packages/data/    # Repository interfaces + HTTP implementations + generated contract types
packages/platform/# Device-capability + storage interfaces, web implementations, repository registry
packages/config/  # Shared TypeScript and Vitest bases
contracts/        # Generated, committed OpenAPI contract
deploy/vm/        # The whole deployment platform: Caddy + API + PostgreSQL, provisioning, backups
e2e/              # Playwright end-to-end tests (Chromium, WebKit, Firefox)
brainstorm/       # Design sessions and their decisions; idea-inbox.md
specs/            # Feature specifications
docs/             # superpowers/ design docs and plans; record/ (moved-out history)
```

## Product

**MyNet** — a multi-event attendee engagement and professional networking platform. It **is** an
authenticated attendee workspace, not a marketing site and not a generic enterprise dashboard. It
answers, in this order of prominence: *What is happening next? Who should I meet? Where are my
conversations, notes, and appointments?* Core journey: inspect the next session → discover a
relevant attendee → share a card or message them → schedule a networking appointment.

**Two actors (since v4.0.0).** The **attendee**, who signs themselves up. And an administrator in two
tiers, **neither reachable by self sign-up**: a **platform operator** (seeded, product-wide, the only
tier that promotes or reads reports) and a **conference organizer** (a promoted attendee, authority
only over assigned conferences plus any they create). Administration is a **separate website** on
the same API and database; **MyNet has no admin surface, privileged view or role-dependent
rendering**, asserted as an absence. **No tier may edit anybody's profile.** Payment processing stays
out of scope.

### The five destinations

Each is individually addressable; Home is the entry view, built around the active event.

- **Home** — event switcher, greeting with day context, "Up next", rest-of-day timeline, people to
  meet, appointment summary, unread indicator. Composed of independent cards.
- **Agenda** — the programme with an All/Saved filter; save/enrol; an addressable session panel with
  Overview, personal Notes, audience Q&A, Speaker info.
- **Discover** — attendee directory with search and role/interest filters; open profile, share card,
  message, schedule.
- **Messages** — conversation list plus focused thread; private to its two participants; cross-event.
- **Network** — held cards (contacts) and appointments; scheduling is a compact modal over slots.

Saved sessions, notes, Q&A votes, conversations, cards and appointments are **durable, per-attendee,
server-side state**. The prototype's local-only behaviour is a prototype artifact.

### Domain terminology

**Event** (a conference; name, location, day N of M; switchable) · **Session** (time, title, room,
track, optional speaker; may be optional with capacity and enrolment) · **Track** (visually coded
category) · **Saved session** · **Attendee / profile** (company, role, interests, sector, **intent**,
**availability**) · **Digital business card** (mutual exchange; resolves the live profile) ·
**Appointment** (proposed, then accepted or declined, over a 30-minute slot grid) · **Conversation /
thread** · **Q&A** (questions with upvotes) · **Up next** (first-viewport prominence).

## Where things stand

Kept to what a new session needs to orient; detail is in `specs/` and `docs/record/delivery-log.md`.

- **Delivered to `develop`**: 001, 002 (absorbed 003), 004–011, 013, 014 (both tranches), 016, the
  v5.4.0 mechanisms (#30 — cache eviction and erasure, the widened attendee-restriction guard,
  `AdminShell`'s third layout), and **012's machine phase** (#31). Every destination
  `requirements.md` names is built.
- **012 — Launch Readiness** (production split out, departing from the roadmap): its consolidated
  by-hand walk discharges the quickstart scenarios every feature since 007 shipped without. **It is
  the only human validation this project has had, and it is in progress** on `feat/012-walk`.
  Production waits on a registered domain: `prod.env` stays blank by decision 31, which is what
  keeps the deploy job's refusal honest.
- **Startable**: **015** (registration and attendee management) and **017** (the Q&A rebuild under
  v5.0.0's C2, attribution "Ana R." per R2). Choosing between them is an owner decision.
  **017 MUST close the unthrottled block lookup in the same feature** (`POST /blocks` has no
  throttle; `GET /blocks` returns a live name and avatar bytes). **If 015 adds a route that ends a
  registration, register entry 22 reopens.**
- **UAT**: `mynet-dev.programasemilla.com` (+ `admin.`), deployed by hand; seeded data only.
- **Migrations** run to `0012`; **`0010` is permanently unclaimed**. Numbers are **claimed at
  generation** (decision 53), and the claiming feature extends the roadmap's number table in the
  same change. Read `apps/api/migrations/meta/README.md` before regenerating — move it aside first,
  because `drizzle-kit generate` JSON-parses every file in `meta/`. A migration may be regenerated
  only before it has been applied anywhere.

## Architectural invariants — index

A later feature inherits these; **changing one is a decision, not a refactor**. One line each; the
reasoning is in `docs/record/architecture-invariants.md` (and, for 010/014/016, the delivery log).

**Server-side enforcement**

- **Branded scopes, one per authorization predicate**, each constructible only by its guard and each
  with its own route audit: `EventScope`/`requireEventAccess` (per-event content),
  `ConversationScope`/`requireParticipation` (007), `CardScope`/`requireHeldCard` (008, directional
  — the row is the authority), and the administrative `VerifiedOperatorScope` ⊂
  `VerifiedPlatformScope` (013; the tier is a type-level refinement, asserted with `@ts-expect-error`).
  **`event-scope-audit` reports success on a route that names no event**, so every per-event route
  must name `/events/:eventId/…` in its address, even when an id alone would find the row (009).
- **Coverage tests fail a future feature by existing**: `deletion-coverage.test.ts` (every
  attendee-data table cascades from `attendees` or declares retention) and `export-coverage.test.ts`
  (every collected column is exported). Allow-listing requires writing down why.
- **Verification gates exactly one thing: discoverability.** No feature may use it for anything else.
- **`sign_in_attempts` is not deleted with an account** (no FK by design); it expires on the two-hour
  sweep. **Throttling is per action**; reset-request may delay but never deny.
- **An administrative act and its audit entry commit in one transaction.** A `FOR UPDATE` lock is
  worth nothing handed the pool — each statement autocommits; the type cannot say so.
- **Every enrolment-critical write** (enrol, release, capacity edit, delete) takes `SELECT … FOR
  UPDATE` on the session row. **A session anybody has engaged with** (saved, note, question, vote)
  may be cancelled and must not be deleted; an enrolment is deliberately **not** engagement
  (`NOT_ENGAGEMENT`, decision 51). The cascades from `sessions.id` stay; the protection is refusal
  plus lock.
- **A CHECK over an enumerated set is derived from the set's source**, never hand-copied.
- **The application pool carries `lock_timeout` < `statement_timeout`, plus
  `idle_in_transaction_session_timeout`**; migrations set `lock_timeout` in `migrate.ts`, never in
  generated SQL.
- **`/ready` is what deployment gates on**; `/health` is deliberately unchanged.

**Append-only extension points** — contribute a line and your own file; never edit a neighbour's

- `apps/web/src/app/home/registry.ts` (Home cards) · `apps/web/src/app/navigation.ts` (destinations;
  `routes.tsx` names no address literally) · repository interfaces, route registration and the seed,
  split per domain · `Repositories` in `packages/platform` (one line; `registry.tsx` untouched).

**Client behaviour**

- **Offline reads come from a caching decorator at the repository boundary**, keyed `(attendeeId,
  eventId, resource)`, 24-hour lifetime, **evicted at expiry**, and a conference absent from a
  successful `listRegistered()` is erased. Every cached surface states when it was retrieved.
  **Writes are refused, never queued** — no write queue, optimistic update or conflict merging.
- **The decorator treats every method not named in `reads` as a write, and a write purges the
  conference prefix.** A live read must be declared `passThrough`, and handlers bind to `target`
  (HTTP repositories hold `#private` fields a Proxy cannot carry).
- **Deliberately uncached, declared rather than omitted**: Discover, Messages (asserted by
  `messages-absences.test.ts`), and Q&A (undecorated — do not add `cached` to gain `passThrough`).
  Remaining places is a live `passThrough` read while the commitment set stays cached.
- **`CatalogRepository` is read-only in perpetuity**; attendee state about content lives elsewhere
  (`CommitmentRepository`, `saved | place`).
- **Classify errors on `error.code`, never on the class** — and a code is worth nothing unless it
  says *which* refusal it is. Refusal sets carry a **mutual-difference** assertion in both clients.
- **A refusal's follow-up question must be about the READER**, never the other party (008's
  enumeration oracle). Refusals are indistinguishable by construction where existence would leak
  (404 for a conversation you are not in; reasonless 409 for a blocked send).
- **Modal `<dialog>`s use `showModal()` and are centred by the base rule in `theme/tokens.css`**
  (Preflight's `margin: 0` pins them top-left). Focus is restored to the opener explicitly, after
  closing. Confirmations reuse `ConfirmDialog`. **A nested dialog's `cancel` reaches ancestor React
  handlers** — compare `event.target`. Layout is asserted by `e2e/responsive.spec.ts`, which
  measures position, not only width.
- **Reading hook state inside a handler closes over a stale value**; a write resolves to whether the
  server accepted, and a late success clears a field only if it still holds what was posted.
- **Polling** goes through `usePoll` (visible-only, jittered, backing off, three-failure threshold;
  a superseded read reports `POLL_SUPERSEDED`). Thread 3s, conversation list 10s; the list pauses on
  whether **it** is displayed (`useDisplayed`, size-observed), never on viewport width.

**Platform boundary**

- **Feature code calls neither browser APIs nor the network.** Eight device capabilities
  (Principle V): `NotificationService`, `CalendarService` (exists, must not be wired),
  `CameraService`, `ContactShareService`, `SecureStorage`, `ConnectivityService`,
  `VisibilityService`, `InstallService` — plus `StorageService`. `substitution.test.ts` guards the
  set; a ninth is an amendment. `mynet/no-direct-platform-access` is a denylist — **a denylist is a
  list of what somebody remembered**; exemptions are per-line with a reason, never per-file.
- **Vendors are confined by lint** to `apps/api/src/storage/`, `…/notifications/`, `…/mail/`, and
  each port's adapter is **selected by configuration identically in every environment** (keys
  present → real; absent → sink), so a local run is the production path.

**Messages and notifications (007, widened by 014)**

- Conversations are **permanent, cross-event and need no acceptance**; deleting an account removes its
  messages everywhere, leaving the survivor a read-only thread with `counterpart: null`.
- The message cursor carries **microseconds**; the wire carries milliseconds.
- **Exactly two notification triggers**: a received message, and a **material change** (cancelled,
  start time, room — nothing else) to a session the attendee has saved or holds a place in, one
  coalesced push per attendee per organizer act. **A session starting is forbidden**; nothing
  time-driven may dispatch (`no-session-start-trigger.test.ts`). `DISPATCH_CALLERS` has two entries;
  a third is an amendment. **No bell, no notification centre, and no view in either product may show
  the change count** — the marker is per-row state.
- Push subscriptions are keyed on the **endpoint alone** and reassigned on re-registration; a dead
  subscription (410) is discarded, a failing one is not. The service worker is hand-written
  (`apps/web/src/sw.ts`, `injectManifest`), registered explicitly in dev and prod, and **carries the
  API denylist**. `NotificationPrompt.tsx` is the only caller of `requestPermission`; **denial is a
  complete outcome**.

**Network (008, 016)**

- **A card exchange is mutual, atomic (both rows or neither), and guarded once**;
  `exchangePermitted` takes `FOR SHARE` and must never become `FOR UPDATE`. The recipient must be
  discoverable at the moment of sharing (FR-1053) — relaxing that needs an amendment.
- **Card resolution applies no discoverability, verification or registration condition** — each
  looks like a forgotten `WHERE` and is the feature. `CardRepository` takes no `eventId`. Contacts are
  **never derived** from conversations or appointments.
- **Appointments are per-event and named so in the URL.** Availability is computed from the reader's
  commitments alone; a received proposal consumes nothing; double-booking is caught at acceptance.
  `lapsed` is derived, never stored.
- **Blocking severs a card read-side (lifting restores it) but cancels appointments by a write**;
  withdrawing from a conference cancels your live meetings there in the same transaction.
- The seed clears the whole Network domain (`shared_cards.event_id` is `ON DELETE NO ACTION`).

**Directory (006)**

- **The directory is one query** (visibility, search, filters, shared-interest rank, keyset bound);
  its only outside input is the reader's own interests. Pagination: no duplicate ever, omissions
  permitted; `useDirectory` de-duplicates. Filter options: a closed vocabulary is offered whole,
  roles accumulate what the reader has seen.

**Q&A (009 as running; 017 rebuilds it)**

- Votes are `count(*)` at read time, never a column; the composite PK on `question_votes` is
  one-vote-per-attendee; withdrawal re-checks "no votes" under `FOR UPDATE` inside the transaction;
  every write returns the full re-ordered list keyed by question id. Blocking filters the read and
  enters no aggregate. A departing attendee's questions go, with everybody's votes on them.
- **Absence guards strip comments before matching** — every pattern also appears in the prose
  explaining the absence.

**Administration (013, 014)**

- **A second product, not a second surface**; a **subdomain** because it is the only topology that
  is same-site (keeps `SameSite=Lax` CSRF defence) and different-origin (own storage, worker scope,
  CSP). Host-only cookie: two independent sessions.
- **The report queue is platform-tier only**; `content unavailable` is a first-class state; reading
  one report writes an audit entry, reading the queue does not. No read path over the audit trail.
- **FR-918** (an address is unique across `attendees` and `operators`) is enforced in application
  code on both create paths, with the same 409 either way.
- The seed creates operators with **no credential** (the repository is public); the bootstrap never
  resets a password an operator chose (`WHERE credential_is_initial = true`).
- An organizer's authority ends with their access (deletion revokes all assignments; withdrawal
  revokes that one); an unowned conference is explicitly `unassigned`.
- **No route suspends, removes or restricts an attendee** — an operator acts on content and
  authority, never on a person. `no-attendee-restriction.test.ts` enumerates **every** non-GET
  administrative route with a written statement of what it acts on, so a new one fails by existing.
- **A CORS method list is exercised only by a real browser's preflight** (`fastify.inject()` does
  none); each method in `app.ts` names its callers.

**Brand and build (010, 016)**

- `scripts/brand-audit.mjs` asserts build-output claims after `pnpm build` (a missing worker is a
  **failure**, not a skip). Nothing is upscaled except one named exception (this source, this factor,
  these outputs, checked for equality). Install icons and favicons derive from
  `assets/brand/new-logo.png`, every in-app mark from `assets/brand/logo.png`; the two pipelines
  write disjoint sets. Install icons are not precached (`includeManifestIcons: false`).
- **An inventory read twice is derived twice, never written twice.**

**Testing lessons that are now rules**

- **A comment is a claim that needs a guard.** 013 found four emphatic headers describing call
  relationships that did not exist; 014 found a fifth. Verify what a header asserts.
- **A check that did not execute has not passed** — no `skipIf` on a build artifact in a layer that
  does not build.
- **A requirement whose subject is prose cannot be verified by grepping its own number**, and a guard
  that cries wolf gets weakened until it checks nothing — narrow it to its population instead
  (`deviations.md` D14 records why narrowing is not weakening).
- **A new integration file that depends on the seed reseeds in `beforeAll`**; files run in size order.
- **Test doubles must have the real shape** (a class with a `#private` field, a real `BEFORE INSERT`
  trigger), or they prove the check exists while checking nothing.
- **Layout is the part no behavioural gate examines.** Both defects a human found before 012 were
  layout, found within minutes, past every gate.

## How work is done here

### Branching and change flow

`main` and `develop` are protected. **Never commit or push directly to either.** Branch from
`develop` as `<type>/<short-description>` (`feat`, `fix`, `chore`, `docs`, `spec`, `refactor`), open
the PR against `develop`, **squash**-merge and delete the branch. `develop` → `main` is also a PR.
Activate the hooks once per clone: `git config core.hooksPath .githooks`. They are bypassable with
`--no-verify`, and server-side branch protection is **not configured** (register entry 15).

**Parallel branches cannot see each other's numbers.** Constitution versions, decision numbers,
register entries, brainstorm sessions, feature numbers and migrations have each collided. Check every
branch in flight before claiming any of them.

### Constraints

- **Attendee data is personal data** (Principle VIII): every record attributable to one identity,
  every read path scoped by identity, authorization server-side. Secrets never reach a client bundle.
  **Four recorded exceptions** to "private content stays private": profile visibility to
  co-attendees; approved Q&A under an attributed name; the platform-tier report queue; and an
  assigned organizer's enrolment roster. A fifth needs an amendment.
- **Deletion and export are per-feature duties**, declared in the change that introduces the data.
- **Data access goes through repository interfaces** (Principle V).
- **Every feature declares its own completeness** in the spec's *Feature Declarations* (Principle IX,
  now in `.specify/templates/spec-template.md`): actor and tier, **administrative counterpart**
  (decision 42 — "none, because…" is valid; silence is not), offline behaviour, three layouts,
  empty/loading/failure states, accessibility, checklist items, identity and event scoping, register
  position, migration number. **None may be deferred to a polish pass.**
- **Hybrid event scoping** (decision 7): conference content is per-event; relationships persist
  across events. **Every new table declares which rule applies and why.**
- **Conference content is live-edited** — no draft/publish lifecycle without an amendment.
- **Out of scope**: payment processing; calendar integration (interface exists, must not be wired);
  networking outside an event (blocked on the client's legal review).
- Loading and failure states wherever data crosses the network. Every control has an accessible
  label, visible focus and keyboard support; modals have a clear close action and Escape.
- **Responsive**: desktop = persistent left rail, contextual top bar, multi-column dashboard; tablet
  = reduced rail, two-column cards, stacked detail; mobile = compact header, bottom navigation,
  single-column cards, full-width overlays, touch-sized controls. **Nothing primary may require
  horizontal scrolling.** Both products present all three layouts.
- **Required empty/error states**: no search results (message + reset filters), no saved sessions
  (invitation to explore), empty thread (conversation starter), no meeting slots (explanation +
  close), empty message or topic (**disabled confirmation**, never a post-submit error).
- **Visual direction**: editorial conference aesthetic — deep navy surfaces, warm coral accents, soft
  cream backgrounds, white content cards, subtle mint status cues; people, sessions and time are the
  strongest elements. Never a generic enterprise dashboard.
- **No feature may be read as having validated a layout because its tests are green.**

### Reading `requirements.md`: WHAT binds, HOW does not

| **WHAT — binding** | **HOW — superseded** |
|---|---|
| Actors, capabilities, five destinations, workflows | "single-route, front-end product demo" |
| Domain terminology and visual direction | "without external services, authentication, or durable storage" |
| Accessibility and responsive obligations | "data live in focused in-file constants" |
| Required empty and error states | "No network request is required" |
| The core journey and success criteria | "Browser reloads reset state, which is acceptable" |
| Product exclusions (payments; organizer admin until v4.0.0) | "Not included: persistent databases, real authentication" |

### Technology stack

- **Client**: React + TypeScript installable PWA; offline behaviour specified per feature.
- **Backend**: project-owned Fastify API over **PostgreSQL** with Drizzle and reviewed migrations;
  the contract (`contracts/`) belongs to this project.
- **Authentication**: real, server-side sessions; self-implemented (whether that is settled is
  register entry 12).
- **Deployment** (`deploy/vm/`, runbook in its README — read section 6 before rolling back): one
  Azure VM per environment, Caddy with automatic TLS serving the client and proxying `/api/*`, an API
  container, a **loopback-only** PostgreSQL container, daily backups with an exercised restore.
  Subscription `d428f98f-a3c4-49c3-ae24-06ec3de08477`, `centralus`, pinned **by id**. **Client and
  API share one origin** (decision 19), and **UAT and production must stay separate registrable
  domains**. Mail is Mailgun; Web Push uses one VAPID pair per environment, rotated only on
  compromise.
- **Linux CI**, no Apple infrastructure. Ten correctness gates — typecheck, lint, unit, component,
  contract, migrations, integration against real `postgres:17`, accessibility, e2e, build — plus the
  brand audit. `pnpm verify` runs them locally; `pnpm start` brings up API, MyNet and the admin site
  and prints a generated operator credential.
- **Add Capacitor only** when App Store distribution is mandatory, a capability is inadequate on the
  web, or field testing shows PWA installation harms adoption. **Test on a physical iPhone before
  production.**

### Role of the prototype

`GroundZero/prototype/` is an **approved visual and interaction reference, not production code** — a
Figma Make export whose architecture carries no authority. Use it for flows, composition, copy, sample
data shape and visual language. It implements neither Escape nor visible focus (defects, not
questions), and its hardcoded persona and date are replaced by real data.

## Open questions

**Do not silently resolve any of these.** The register in the constitution is authoritative; this is
the live subset. **None blocks a feature.**

**Numbered register entries still open**: **1** what "PS" denotes · **3** whether
`requirements.md` is amended · **12** authentication ownership · **15** server-side branch
protection unconfigured · **16** the repository is public — seed, migrations and contract are
world-readable · **19** nobody moderates avatars (addressed, not closed — a capability is not a
policy) · **21** somebody has to *be* the operator reading reports (addressed, not closed) · **23**
whether tokens adopt the brand's navy and coral · **28** two brand marks coexist; no feature may
quietly replace one with the other · **29** whether an attendee may suppress notification content ·
**30** speakers are personal data about non-attendees · **31** whether deleting a session should
notify its enrolled attendees (a third trigger, so an amendment).

**Raised by reviews, not numbered — promoting one to the register is an owner act**:

- **A mutually exchanged card outlives the discoverability that licensed it** (016). Looping
  `POST /cards` over the directory converts a revocable publication into a permanent one; the
  throttle bounds a rate, not a right, and `GET /cards/shared` has no client consumer, so a subject
  cannot see who holds their card.
- **Whether a question's payload should carry `authorId`, and whether `listBlocks` should be
  narrowed** (009). R2 made this more urgent and settled neither; 017 must not treat either as
  settled.
- **Whether proposing a meeting should require the invitee to be discoverable** (008) — the spec's
  Assumptions say no.
- **Whether the audit trail's retention clock starts at pseudonymisation**, as two comments claim
  (013, `deviations.md` D11). It measures `occurred_at`; fixing it needs a column and a migration.
  `retention-sweep.test.ts` pins current, not desired, behaviour.
- **Whether 24 hours is the right cache lifetime** — deferred by R1 as a usefulness judgement after a
  real conference, not a register entry.
- **The mobile top bar truncates "MyNet"** (pre-existing since before 010) — the owner's call; no
  entry carries it.
- **Whether the client is told** that "Ana R." reads her *"sin apellidos"* as about tone (R2 says she
  must be).

### Known unclaimed defects

From 004's review: neither token table indexes `attendee_id` (every deletion cascade-scans both), and
migration `0003` rewrites `events` under a volatile default. Both need deliberate work, because the
fix requires regenerating a Drizzle snapshot.
