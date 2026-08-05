# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status of this repository

This repository currently contains **only** the GroundZero materials: the approved requirements, the approved prototype, and the initialization brief. **No production application exists yet.** Per `GroundZero/README.md`, production implementation should not begin until the initialization approach has been validated against the requirements.

```
GroundZero/
  README.md        # Initialization brief + tech-stack recommendation
  requirements.md  # Authoritative product requirements
  prototype/       # Approved Figma Make prototype (reference only)
```

Project governance lives in `.specify/memory/constitution.md`. It is authoritative for how work
is done here and supersedes tool defaults and habit.

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

**EventLink** — a multi-event attendee engagement and professional networking platform. The experience must feel like an authenticated attendee workspace, not a marketing site.

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
- **Agenda** — personalized schedule in chronological order; sessions show time, track, room, speakers, saved state; add/remove sessions; open a session detail panel with Overview, personal Notes (local save), audience Q&A with upvoting, and Speaker info.
- **Discover** — information-rich attendee cards; search plus role/interest filters; each profile exposes company, role, interests, networking intent, availability; actions are open profile, share digital business card, start a message, schedule a meeting.
- **Messages** — conversation list plus a focused thread; switch conversations, compose a demo message. Nothing is delivered to a real recipient.
- **Network** — saved contacts, exchanged digital cards, and scheduled appointments. Meeting scheduling is a compact modal with selectable time slots and a short topic field; confirming adds a local appointment and shows clear success feedback.

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

## Business rules and constraints (from `requirements.md`)

- Single-route, front-end demo with realistic sample data. No external services, no authentication, no durable storage, no network requests. Browser reload resets state — acceptable for this scope.
- Out of scope: organizer admin, real auth, persistent databases or uploads, payments, live chat delivery, notifications, calendar integrations.
- Every interactive control has an accessible label, a visible focus state, and keyboard support. Modals need a clear close action and Escape-key behavior where practical.
- Responsive: desktop = persistent left navigation rail, contextual top bar, multi-column dashboard; tablet = reduced rail, two-column cards, stacked detail; mobile = compact header, bottom navigation, single-column cards, full-width overlays, touch-sized controls. **No content or primary action may require horizontal scrolling.**
- Required empty/error states: no attendee search results (message + reset-filter action), no saved sessions (invitation to explore), empty thread (conversation-starter prompt), no meeting slots (explanation + close), invalid empty message or meeting topic (**disabled confirmation**, never a post-submit error).
- Visual direction: editorial conference aesthetic — deep navy surfaces, warm coral accents, soft cream backgrounds, white content cards, subtle mint status cues. Confident contemporary typography, restrained rounded corners, purposeful shadows. Must not read as a generic enterprise dashboard; people, sessions, and time are the strongest visual elements. Consistent icon set; decorative shapes subtle and geometric.
- Validation checklist for a completed build: production build success, desktop and mobile rendering, navigation and event switching, search/filter, session save + notes + Q&A, message composition, card-sharing feedback, meeting scheduling and appointment creation, keyboard focus visibility and accessible labels.

## Technology stack

`requirements.md` contains **no** technology-stack section, despite `GroundZero/README.md` naming it as the source for stack guidance. The only recorded recommendation lives at the end of `GroundZero/README.md`:

- Build with **React + TypeScript as an installable PWA**: manifest, app icons, offline shell, versioned caching, explicit online/offline states. Do not implement complex synchronization until persistent user accounts and a backend are real requirements.
- **Create a platform abstraction layer from the start.** Application code calls interfaces — `NotificationService`, `CalendarService`, `CameraService`, `ContactShareService`, `SecureStorage`, `ConnectivityService` — never browser or native APIs directly. Initial implementations may be web-based or no-op demo stubs.
- **Linux-based CI**, no Apple infrastructure required: type checking, linting, unit tests, component tests, accessibility checks, end-to-end browser tests, production build, preview deploy on every change.
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

1. `GroundZero/requirements.md` — product requirements.
2. Client-provided reference images — visual intent. **Not present in this repository**; the only images here are Unsplash avatar photos used as prototype sample data.
3. `GroundZero/prototype/` — approved interaction and presentation reference.
4. Existing source code — implementation reference only, unless explicitly confirmed as production architecture.

When sources conflict, **do not resolve by assumption.** Record the discrepancy as an open question.

## Open questions and known discrepancies

Do not silently resolve any of these.

- **Product name.** `requirements.md` and the prototype UI say "EventLink". The repository directory is `mynet-ps` and `index.html` sets the title to "MyNet - PS - proto". Which is the product name is unresolved.
- **Desktop experience does not exist.** `requirements.md` requires a desktop navigation rail, contextual top bar, and multi-column dashboard, plus a tablet layout. The prototype is mobile-only: a fixed 390×844 phone frame with a simulated iOS status bar and bottom navigation, centered on a navy page. Desktop and tablet layouts are unimplemented and unvalidated by the client.
- **Stack guidance is not where the brief says it is.** `GroundZero/README.md` designates `requirements.md` as authoritative for the technology stack, but `requirements.md` contains no stack section. The recommendation exists only in `README.md`.
- **Demo scope vs. PWA recommendation.** `requirements.md` scopes a stateless demo with no durable storage; the stack recommendation calls for an installable PWA with offline shell, versioned caching, and a `SecureStorage` interface. How much persistence the first production milestone should have is undecided.
- **Attendee profile view.** Requirements say the attendee can "open a profile"; the prototype has no profile detail screen — only Discover cards with inline actions.
- **Exchanged digital cards.** Requirements place exchanged cards in Network. In the prototype, sharing a card is a transient 2-second confirmation in Discover and is never recorded anywhere.
- **Event scoping.** Switching events changes only the event name, location, and day counter. Sessions, attendees, conversations, and appointments are global constants shared across all events. Whether production data should be scoped per event is unspecified but strongly implied.
- **Escape-key and focus behavior.** Requirements ask for Escape handling on modals and visible focus states. The prototype implements neither: no key handling on the session panel or meeting modal, and inputs use `focus:outline-none` with only a border-color change as replacement.
- **Contacts derivation.** Network "contacts" are derived from the existence of a conversation, not from an explicit connect/accept action. There is no defined connection model.
- **Hardcoded persona and date.** The greeting is "Good morning, Sarah" and the date is "Tuesday, March 18" regardless of event or actual time; "Starts in 15m" on the Up Next card is static text.
- **Notifications.** The prototype header shows a notification bell with an unread dot, but notifications are listed as out of scope in `requirements.md`.
