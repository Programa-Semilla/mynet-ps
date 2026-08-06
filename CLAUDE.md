# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status of this repository

This repository contains the GroundZero materials plus in-progress specification work. **No production application code exists yet.**

```
GroundZero/
  README.md        # Initialization brief + tech-stack recommendation
  requirements.md  # Product requirements (read for WHAT, not HOW — see below)
  prototype/       # Approved Figma Make prototype (reference only)
brainstorm/        # Design sessions and their decisions
specs/             # Feature specifications
```

Project governance lives in `.specify/memory/constitution.md` (**v2.0.0**). It is authoritative for
how work is done here and supersedes tool defaults, habit, and any conflicting statement in this
file.

### Standing decisions (2026-08-04, project owner)

These were decided explicitly and are **not** open for re-inference:

1. **The product is MyNet.** Not EventLink.
2. **MyNet is the real product, not a demo.** The front-end-demo framing is withdrawn.
3. **`requirements.md` is authoritative for WHAT the product is, not HOW it is delivered.**
4. **Durable persistence is foundational** — a project-owned API over managed PostgreSQL.
5. **Real authentication is foundational**, not a later addition.
6. **The five destinations are individually addressable** (each has its own URL).

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
`develop`. They are bypassable with `--no-verify` — server-side GitHub branch protection is not
yet active because this is a private repository on a free personal account. See
`.githooks/README.md`.

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
- **Still out of product scope**: organizer administration and payment processing. Notification delivery and calendar integration stay out until a recorded decision brings them in — their interfaces exist but must not be wired to real delivery.
- **Data access goes through repository interfaces.** Components never call the network or know transport details. See constitution Principle V.
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

### Require a client decision

- **`requirements.md` is now knowingly out of step** with the constitution on product name, delivery mode, persistence, authentication, and routing. Whether it is amended or the divergence is simply recorded is undecided.
- **Attendee identity model.** How a person becomes an attendee — self sign-up, event invitation, ticket holder, organizer-provisioned — is unspecified, and it determines the authentication design.
- **Data retention, deletion, and export obligations** for personal data are recognised (constitution Principle VIII) but unspecified.
- **What "PS" denotes** in the repository name `mynet-ps`.
- **Real brand mark and application icons.** No logo exists in this repository.
- **Desktop experience does not exist.** `requirements.md` requires a desktop navigation rail, contextual top bar, and multi-column dashboard, plus a tablet layout. The prototype is mobile-only: a fixed 390×844 phone frame with a simulated iOS status bar and bottom navigation, centered on a navy page. Desktop and tablet layouts are unimplemented and unvalidated by the client.
- **Stack guidance is not where the brief says it is.** `GroundZero/README.md` designates `requirements.md` as authoritative for the technology stack, but `requirements.md` contains no stack section. The recommendation exists only in `README.md`.
- **Attendee profile view.** Requirements say the attendee can "open a profile"; the prototype has no profile detail screen — only Discover cards with inline actions.

### Require an owner or planning decision

- **Repository shape** — whether the API lives here or in its own repository.
- **API hosting and the managed PostgreSQL provider.**
- **Authentication ownership** — self-implemented versus a delegated provider.
- **Preview environments must never point at production data**, and preview access control is undecided. Cloudflare Pages previews are publicly reachable by default.
- **Server-side branch protection is unavailable** (private repo, free personal account; APIs return 403). Enforcement is client-side and bypassable — materially more serious now that real attendee data is in scope.

### Data-model questions the database forces (client decision)

These were cosmetic while everything was sample data. With a real schema they must be answered
before the tables that depend on them are created.

- **Event scoping.** Are sessions, attendees, conversations, and appointments scoped per event or shared across events? In the prototype, switching events changes only the name, location, and day counter — everything else is global. Strongly implied to be per-event, but unspecified.
- **The connection model behind Network contacts.** The prototype derives contacts from the existence of a conversation. There is no connect or accept action, so there is no defined relationship to store.
- **Exchanged digital cards.** Requirements place them in Network; the prototype shows a transient 2-second confirmation and records nothing. What a card exchange creates, and whether it is mutual, is undefined.
- **Notifications.** The prototype header shows a notification bell with an unread dot, but notifications are out of product scope. The bell should not exist until a decision brings notifications in.

### Not open questions — settled requirements the prototype failed to meet

- **Escape-key and focus behavior.** Requirements ask for Escape handling on modals and visible focus states. The prototype implements neither: no key handling on the session panel or meeting modal, and inputs use `focus:outline-none` with only a border-color change. Constitution Principle IV settles this — it is a defect to fix, not a question to answer.
- **Hardcoded persona and date.** The prototype greets "Good morning, Sarah" on "Tuesday, March 18" regardless of event or actual time, and "Starts in 15m" is static text. With real authentication and real data these become the signed-in attendee and actual times. Prototype artifact, now moot.
