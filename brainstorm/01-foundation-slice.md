# Brainstorm: Production Foundation Slice

**Date:** 2026-08-04
**Status:** active

## Problem Framing

The repository contains only GroundZero materials — approved requirements, an approved Figma Make
prototype, and an initialization brief. No production application exists. `GroundZero/README.md`
and constitution §"Development Workflow and Quality Gates" both bar production implementation
until the initialization approach has been validated against `GroundZero/requirements.md`.

This session performs that validation for the first slice: standing up the production project
with the recommended stack, comprising scaffold, platform abstraction layer, and CI.

The central tension identified up front: Principle VII requires CI to run accessibility checks,
end-to-end browser tests, and desktop/mobile rendering verification. A scaffold that renders
nothing gives those gates nothing to check, so the boundary of "foundation" determines whether
the CI half of the slice is genuinely exercised or merely wired up and idling.

A hard constraint was confirmed during exploration: **the repository contains no logo and no app
icon.** The only images present are five 1024×1024 Unsplash avatar photos in
`GroundZero/prototype/src/imports/EventlinkMobileHome/`. No client-provided reference images are
in the repository either. Principle VI nonetheless requires application icons.

## Approaches Considered

Four decisions were explored in sequence. The first three narrowed scope; the fourth chose
delivery shape.

### Slice depth — how far does the foundation go?

#### A: Foundation + walking skeleton *(chosen)*
Scaffold, design tokens, platform abstraction interfaces and stubs, CI — plus the app shell:
responsive navigation routing between five empty destination screens.
- Pros: every CI gate has real work; a11y checks run against real controls; e2e navigates real
  routes; all three responsive layouts become verifiable. Principle IV calls focus and responsive
  behaviour "expensive to retrofit" — this establishes them before content exists.
- Cons: larger than a pure scaffold; some layout decisions are made before content is known.

#### B: Pure infrastructure only
Scaffold, tokens, interfaces, CI, placeholder page only.
- Pros: smallest possible first change; no layout decisions taken prematurely.
- Cons: a11y, e2e, and responsive gates unexercised; retrofit risk on exactly the requirements
  the constitution flags as expensive to add late.

#### C: Foundation + full Home destination
Walking skeleton plus the complete Home dashboard with sample data.
- Pros: delivers the first-viewport success criterion immediately.
- Cons: mixes infrastructure decisions with product decisions in a single review.

### PWA scope

#### A: Full PWA shell with placeholder icons *(chosen)*
Manifest, service worker, versioned caching, offline shell, and explicit online/offline state
driven through `ConnectivityService`. Icons ship as visibly provisional geometric placeholders
drawn from the approved palette.
- Pros: caching strategy is architectural and interacts with the deploy step, so deciding it late
  is costly; satisfies Principle VI now.
- Cons: ships placeholder branding that must not be mistaken for final.

#### B: Manifest and icons only, service worker deferred
- Pros: installable immediately, less surface in the first change.
- Cons: leaves the architectural half of Principle VI undecided.

#### C: Defer all PWA concerns
- Pros: smallest slice.
- Cons: Principle VI states the product MUST be an installable PWA; deferring needs recording as
  deliberate sequencing rather than omission.

### Preview deployment (Principle VII, eighth gate)

Seven of the eight CI gates are fixed by Principle VII and were not treated as open. Only the
preview-deployment gate required a decision, because it needs a host and credentials, and the
constitution already records that this repository is private on a free personal GitHub account.

#### A: Wire the job, park the target
Preview-deploy job present but gated on a missing secret, skipping with a visible notice.
- Pros: no external dependency blocks the slice; the gap announces itself in CI.
- Cons: Principle VII is not fully satisfied.

#### B: Pick a host now and deploy for real *(chosen)*
- Pros: satisfies Principle VII with no gap.
- Cons: blocks the slice on account creation and repository secrets — an external action.

#### C: Omit the preview job entirely
- Pros: cleanest workflow file.
- Cons: the gap becomes invisible in the pipeline itself.

**Host selection.** Cloudflare Pages was chosen over Netlify, Vercel, and GitHub Pages:

| Host | Commercial use on free tier | Private repo | PR previews | Notes |
|---|---|---|---|---|
| **Cloudflare Pages** *(chosen)* | Permitted | Yes | Unlimited | No build-minute cap; driven from GitHub Actions via wrangler, so no third-party app needs repository write access |
| Netlify | Permitted | Yes | Yes | 300 build-minutes/month cap; a seven-gate pipeline on an active branch can consume it |
| Vercel | **Prohibited on Hobby** | Yes | Yes | Client work would require a paid Pro seat to be licence-clean |
| GitHub Pages | n/a | **Requires GitHub Pro** | No native model | Same account limitation that already blocks server-side branch protection here |

### Delivery sequencing

#### A: Contract-first, three PRs *(recommended, not chosen)*
Tooling+CI → tokens+shell → abstraction+PWA, each PR enabling the gates it makes verifiable.
- Pros: reviewable increments; gates arrive with the capability they check; `ConnectivityService`
  gets designed against the offline banner that actually consumes it rather than against a guess;
  matches the installed `spex-collab` phase-split model.
- Cons: three review cycles; preview-deploy stays red or skipped until secrets land.

#### B: Two PRs — infrastructure, then experience
- Pros: fewer cycles; the abstraction layer reviewed as one coherent contract.
- Cons: six interfaces defined with no consumer, reviewed in the abstract.

#### C: Single PR *(chosen)*
- Pros: one review, one merge; the slice is internally consistent by construction.
- Cons: large diff mixing build config, design tokens, layout, service contracts, and
  service-worker caching. Principle V compliance is the specific thing a passing build cannot
  verify, and it is the thing most likely to be skimmed in a diff this size.

An automated Principle V guard (ESLint restricting `navigator`, `Notification`, `localStorage`,
and `getUserMedia` to `src/platform/**`) was offered as mitigation for the single-PR choice and
was **declined**. Principle V compliance therefore rests on human PR review and the
`/speckit-spex-gates-review-code` gate.

## Decision

Build the production foundation as a **walking skeleton delivered in a single pull request**,
branched from `develop` per the constitution's branching rules.

The slice comprises the project scaffold and tooling, design tokens, the responsive application
shell routing between five empty destinations, the six platform abstraction interfaces with
web or no-op stub implementations, the full PWA layer with provisional icons, and the complete
eight-gate Linux CI pipeline deploying PR previews to Cloudflare Pages.

Rationale for the walking-skeleton depth: it is the smallest scope in which every CI gate
mandated by Principle VII does real work, and it establishes the focus, keyboard, and responsive
behaviour that Principle IV identifies as cheap to keep and expensive to retrofit.

Rationale for single-PR delivery: chosen by the project owner with the review-surface trade-off
explicitly presented and the automated mitigation explicitly declined.

**Product name resolved this session: the product is MyNet.** This was previously an entry in the
constitution's Open Questions Register ("EventLink vs. MyNet/`mynet-ps`"). It is settled by owner
decision, which means `GroundZero/requirements.md` and the prototype UI now carry a stale name,
and the constitution requires an amendment citing this decision before the register entry can be
struck.

## Key Requirements

**Scaffold and tooling**
- React + TypeScript on Vite, with type checking enabled and enforced (`tsconfig.json` is
  mandatory; the prototype has none).
- A lockfile MUST be committed.
- The dependency set MUST be derived from actual need. The prototype's inherited Figma Make list
  (MUI, recharts, react-dnd, react-slick, embla, react-router, the unused shadcn/ui scaffold)
  carries no authority and MUST NOT be copied forward.
- Linting, formatting, and unit plus component test runners configured and running.

**Design tokens**
- Colours, typography, spacing, and radii defined as named tokens in one place. Hardcoded hex
  literals in components are prohibited.
- The approved palette expressed through those tokens: deep navy surfaces, warm coral accents,
  soft cream backgrounds, white content cards, subtle mint status cues.
- A single consistent icon set adopted. Hand-inlined one-off SVG prohibited except for genuinely
  bespoke marks.

**Application shell**
- Desktop: persistent left navigation rail, contextual top bar, multi-column-capable workspace.
- Tablet: reduced rail, layout prepared for two-column cards and stacked detail areas.
- Mobile: compact header, bottom navigation, full-width overlay capability, touch-sized controls.
- Five routed destinations — Home, Agenda, Discover, Messages, Network — rendering no content.
- No content and no primary action may require horizontal scrolling at any supported width.
- Every interactive control in the shell has an accessible label, a visible focus state, and
  keyboard operability. `focus:outline-none` without an equivalent visible replacement is a defect.

**Platform abstraction (Principle V)**
- Interfaces defined and owned by the project: `NotificationService`, `CalendarService`,
  `CameraService`, `ContactShareService`, `SecureStorage`, `ConnectivityService`.
- Initial implementations may be web-based or no-op demo stubs.
- Application code calls these interfaces, never browser or native APIs directly.

**PWA (Principle VI)**
- Web app manifest naming the product MyNet, sourced from a single branding constant that also
  feeds the document title and package name.
- Provisional placeholder icons at 192px, 512px, and maskable, visibly marked as non-final.
- Service worker with versioned caching and an offline shell.
- Explicit online and offline states surfaced through `ConnectivityService`, not `navigator.onLine`
  read directly from feature code.
- No complex synchronization — barred until persistent accounts and a backend are real requirements.

**CI (Principle VII)** — Linux, no Apple infrastructure, on every change:
type checking · linting · unit tests · component tests · accessibility checks · end-to-end browser
tests · production build · preview deployment to Cloudflare Pages.

**Governance**
- Branch `<type>/<short-description>` from `develop`; PR into `develop`; squash merge; delete
  branch. No direct commits or pushes to `main` or `develop`.
- A change is not complete until the pipeline is green. Completion is claimed from pipeline
  output, never from inspection.

**Explicitly out of scope for this slice**
- All destination content: Home dashboard, agenda list, session detail panel, Discover cards,
  Messages threads, Network contacts and appointments.
- Sample data modules; search and filters; notes; Q&A; digital-card sharing; meeting scheduling.
- Real authentication, any backend, durable persistence beyond demo scope.
- Organizer administration (barred by Principle III without an amendment).
- Capacitor or any native wrapper (barred by Principle VI absent a documented trigger).
- The real brand mark.

**Prerequisite that blocks CI going green**
- A Cloudflare account, plus `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` configured as
  repository secrets. This is an owner action; it cannot be completed from within the repository.

## Open Questions

- **Real brand mark and application icons.** No logo exists anywhere in the repository. The slice
  ships visibly provisional placeholders; the client must supply the real mark.
- **What "PS" denotes** in the repository name `mynet-ps`. Not inferred.
- **Constitution amendment required** to record the MyNet decision and strike the product-name
  entry from the Open Questions Register, citing this session's owner decision.
- **Stale product naming** now sitting in `GroundZero/requirements.md` and throughout the
  prototype UI, both of which say "EventLink". A correction path is undecided — requirements.md is
  the priority-1 authoritative source, so amending it is not a casual edit.
- **Abstraction layer shape** — plain interfaces behind a root-injected registry versus a React
  context provider per service. A HOW question, deferred to the plan phase behind the Constitution
  Check gate.
- **`SecureStorage` stub semantics.** Demo scope states that browser reload resets state, but
  `SecureStorage` implies durability. What the stub actually does is undecided; constitution
  §"Persistence" records durable storage as an open question, not a default.
- **Package manager.** The prototype carries a `pnpm-workspace.yaml` pinning Linux/x64+arm64/glibc,
  but no lockfile. The production choice is unmade.
- **Public preview URLs on a private repository.** Cloudflare Pages preview deployments are
  publicly reachable by default. A private client repository would therefore produce
  publicly-accessible preview builds unless Cloudflare Access is placed in front of them. Undecided.
- **Desktop and tablet layouts remain unvalidated by the client.** The approved prototype is
  mobile-only — a fixed 390×844 phone frame. This slice creates the first desktop and tablet
  experience that has ever existed for this product, and the client has approved neither.
- **Server-side branch protection is still unavailable** (private repository on a free personal
  account; branch-protection and ruleset APIs return 403). Enforcement remains client-side and
  bypassable with `--no-verify`. Recorded in the constitution as a known, accepted risk.

---

## Revisit: 2026-08-04

### Updated Problem Framing

The original session accepted `GroundZero/requirements.md`'s "single-route, front-end product demo"
as a binding constraint, and scoped the foundation accordingly — no backend, no database, no
authentication, no durable persistence.

The project owner corrected two things during specification review:

1. **This is the real product, not a demo.** The demo framing is withdrawn entirely.
2. **`requirements.md` is authoritative for WHAT the product is, not HOW it is delivered.** Its
   demo-mode statements describe the prototype's construction, not a decision the client made about
   architecture.

The owner also raised the question that exposed the gap: *where does the database live, where does
the API live, and shouldn't that be considered from the very beginning?*

That question was correct, and it revealed a blind spot in the original session. The constitution at
1.x mandated a platform abstraction layer for six **device** capabilities — precisely so a later
native move would be a packaging change rather than a rewrite — but specified **no equivalent seam
for data**. Under a demo with in-file constants that omission was invisible. The moment a real API
exists, it is the difference between changing one implementation and changing every component that
reads data.

### New Approaches Considered

#### Backend and database architecture

- **A: Managed BaaS (Supabase / Firebase).** Fastest to a working product, near-zero operations,
  auth and realtime included. Cost: vendor coupling, and row-level security becomes load-bearing for
  privacy.
- **B: Custom API over managed PostgreSQL** *(chosen)*. The API contract belongs to the project;
  portable; no vendor lock on business logic. Cost: a materially larger foundation and real
  operational burden — deploys, migrations, secrets, monitoring.
- **C: Serverless functions over a managed database.** Middle path; pairs naturally with the
  Cloudflare choice already made. Cost: cold starts, logic fragmented across deploy units.

#### Authentication timing

- **A: Auth is foundational** *(chosen)*. Per-attendee data cannot exist safely without identity.
- **B: Database now, auth next slice.** Smaller foundation, but every query written in the interim
  assumes a single user, and adding tenancy later touches all of them — the same retrofit class the
  constitution calls expensive.

#### Resequencing

- **A: Re-brainstorm the foundation** *(chosen)*. The original decision's premise no longer holds.
- **B: Patch spec 001 in place.** Faster, but its user stories and Out-of-Scope section were written
  around a demo premise.
- **C: Split into 001 frontend + 002 backend.** Focused specs, but 001 would still need the data
  seam for 002 to plug into.

### Updated Decision

MyNet is built as a **real product with durable server-side state from the first slice**:

- A **project-owned API service over managed PostgreSQL**. Schema changes are versioned, reviewed
  migrations committed to the repository and verified in CI.
- **Real authentication**, with server-side session establishment and validation, and per-attendee
  data isolation enforced server-side rather than by client-side filtering.
- **Repository interfaces for data access**, mirroring the existing device-capability abstraction.
  Components never call the network or know transport details.
- Attendee profiles, private conversations, personal notes, and appointments are treated as
  **personal data** with the obligations that entails.

Ratified in **constitution v2.0.0** (MAJOR — Principle I reframed, Principle V widened to data
access, Principle VI's backend bar lifted, Principle VII extended to API/migration/integration
verification, new Principle VIII for personal data). `CLAUDE.md` updated in the same change.

### What this invalidates from the original decision

**Reversed:**

- "Out of scope: real authentication, any backend, durable persistence beyond demo scope."
- Open Question 6 (`SecureStorage` semantics) is reframed — `SecureStorage` now covers client-side
  secrets only and is explicitly not a general cache; durable attendee data lives server-side.
- The assumption that browser reload resetting state is acceptable.

**Still standing:**

- Walking-skeleton depth for the client shell, and the reasoning behind it.
- Cloudflare Pages for client preview deployments — though preview environments must now never
  point at production data, which is a new constraint.
- Provisional placeholder icons, and the missing brand mark.
- Addressable routes for the five destinations.
- Design tokens, single icon set, no hex literals in components.

**Now questionable and deliberately left open:**

- **The single-PR delivery decision.** Option C was chosen when the slice was frontend-only. The
  scope has roughly doubled — it now includes an API service, a database schema, migrations, an auth
  flow, and backend CI. A single pull request containing all of that is a substantially different
  proposition from the one that was agreed. Flagged for the owner rather than silently re-decided.

### Open Threads

- Attendee identity model — self sign-up, event invitation, ticket holder, or organizer-provisioned.
  Determines the authentication design; a client question.
- Event scoping of data, the connection model behind Network contacts, and what a digital-card
  exchange actually records. All three were cosmetic under sample data; a real schema forces answers.
- Data retention, deletion, and export obligations for personal data.
- Repository shape — API in this repository or its own.
- API hosting and the managed PostgreSQL provider.
- Authentication ownership — self-implemented or a delegated provider.
- Preview environments must never point at production data; preview access control undecided.
- Whether the foundation still ships as a single pull request.
