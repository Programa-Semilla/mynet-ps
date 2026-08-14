# Implementation Plan: App fixes, mutual card exchange, and the install icon

**Branch**: `feat/016-app-fixes-and-install-icon` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-app-fixes-and-install-icon/spec.md`

## Summary

Five repairs, one reversal and one asset change, arising from the project owner using the deployed
product. Four requirements are server-side; the rest are client work across two applications.

**The approach is almost entirely inheritance.** Every mechanism this feature needs already exists
and is documented with its reasoning: the transaction shape from 013's audit writes, the poll shape
from 007's thread, the derived-asset discipline from 010, and the guard on the share path from 008.
What it adds is one genuinely new thing — an **eighth device capability** for install detection —
and that is the finding that changes the plan.

**Two discoveries in Phase 0 were invisible from the specification**, and both are recorded in
[research.md](./research.md):

1. **US5 is gated on a constitution amendment nobody anticipated.** Install detection requires
   `matchMedia`, which Principle V forbids feature code from calling and which the
   `mynet/no-direct-platform-access` lint rule enforces mechanically. The capability must go behind an
   interface, and Principle V's enumerated list of seven must be extended to eight — the act that
   `VisibilityService` established as ratification in v3.1.0.
2. **The password reveal control has nowhere shared to live.** `apps/admin` depends on `@mynet/data`
   and `@mynet/config` only, deliberately not on `@mynet/platform`, and there is no UI package. FR-1050's
   "one behaviour in one place" is satisfied by a shared *test contract* rather than shared code.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22 (API), React 19 (both clients)

**Primary Dependencies**: Fastify + Drizzle over PostgreSQL 17 (`apps/api`); React + Vite +
Tailwind (`apps/web`, `apps/admin`); `sharp` for asset derivation (build-time only, not shipped)

**Storage**: PostgreSQL. **No migration — this feature adds no table and no column.** `0010` stays
reserved for 012.

**Testing**: Vitest (unit, component, integration against a real `postgres:17` service container),
Playwright (e2e), plus `scripts/brand-audit.mjs` for build-output claims

**Target Platform**: Installable PWA — mobile (primary), tablet, desktop; administrative site is a
plain web application on `admin.<host>`, deliberately not installable

**Project Type**: pnpm monorepo — API + two client applications + three shared packages

**Performance Goals**: A message reaches the conversation list within 15 seconds (SC-1002). The list
poll runs at 10s against the thread's 3s, jittered, on a two-vCPU host with a loopback database.

**Constraints**: Messages is entirely uncached and its writes are refused rather than queued
(FR-1013). No horizontal scrolling at any width. The composer bound must hold on the shortest
supported viewport with an on-screen keyboard raised.

**Scale/Scope**: 6 user stories, 54 requirements, 11 success criteria. Two of the eleven success
criteria (SC-1001, SC-1009) are **not machine-checkable** and require a person with a phone.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against constitution **v5.0.0**, ratified 2026-08-12 on this branch.

| Principle | Status | Note |
|---|---|---|
| I — Requirements define the product | **PASS** | Six items from the owner's own use. No question answered that nobody asked; two open questions carried rather than resolved. |
| II — Prototype is reference, not architecture | **PASS** | Nothing here derives from the prototype. |
| III — Attendee experience first | **PASS** | Five stories are attendee-facing; FR-1049/FR-1050 touch two administrative auth screens, which serve whoever signs in and render nothing by tier. **MyNet gains no admin surface.** |
| IV — Accessibility and responsiveness | **PASS, and central** | FR-1002/FR-1003 are mobile-band requirements; FR-1016 covers the reveal control's labelling and keyboard operation. No new modal, so no new Escape handling. |
| V — Abstraction before platform APIs | **⚠ GATED — see Complexity Tracking** | Install detection needs an **eighth capability** and an amendment listing it. Everything else calls existing ports. |
| VI — Web-first delivery | **PASS** | Offline behaviour unchanged in every respect; no repository member changes its cached/live classification. |
| VII — Verified on Linux CI | **PASS** | All ten gates apply. Two success criteria are explicitly outside CI and are declared as such rather than quietly dropped. |
| VIII — Attendee data is personal data | **PASS** | No new table or column; both coverage tests already satisfied (verified: both foreign keys cascade, export runs one query per direction). FR-1053 keeps the share guard server-side. |
| IX — Every feature declares completeness | **PASS** | Feature Declarations complete, including the first `Administrative counterpart` row. |

**Standing decisions checked**: C1 (mutual exchange) is implemented by FR-1021–FR-1030 and FR-1053;
C3 (administrative counterpart) is declared; C4 (second brand source) is implemented by
FR-1038–FR-1048. Decision 7 (event scoping) is declared explicitly rather than inherited. Decision 21
(notification triggers) is respected — FR-1029 dispatches nothing.

**Post-design re-check**: **PASS with the same single gate.** Phase 1 introduced no further
violation. The eighth capability is designed behind an interface in `packages/platform`, exactly as
Principle V requires; what remains outstanding is the amendment that lists it.

## Project Structure

### Documentation (this feature)

```text
specs/016-app-fixes-and-install-icon/
├── plan.md              # This file
├── research.md          # Phase 0 output — six questions, two that changed the plan
├── data-model.md        # Phase 1 output — no schema change; row semantics under mutual exchange
├── quickstart.md        # Phase 1 output — validation walkthrough
├── contracts/
│   └── api-changes.md   # Phase 1 output — two routes changed, one redefined
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16)
└── tasks.md             # Phase 2 output — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── db/queries/cards.ts          # shareCard → transaction, reciprocal row (FR-1021..1025, 1053)
│   └── routes/cards.ts              # refusal classification unchanged; listShared redefined (FR-1051)
└── tests/
    ├── integration/cards.test.ts    # mutual exchange, atomicity under induced failure (SC-1007)
    └── unit/                        # absence assertions unchanged

apps/web/
├── src/
│   ├── app/
│   │   ├── messages/
│   │   │   ├── Composer.tsx         # bounded growth, resize removed (FR-1001..1006)
│   │   │   └── Messages.tsx         # list refresh + pause condition (FR-1007..1012, 1054)
│   │   └── auth/
│   │       ├── SignUp.tsx           # reveal + confirm (FR-1014..1019)
│   │       └── ResetPassword.tsx    # reveal + confirm
│   ├── auth/SignInScreen.tsx        # reveal; install guidance host (FR-1031..1037)
│   └── ui/PasswordField.tsx         # NEW — reveal control, MyNet's copy
└── tests/

apps/admin/
├── src/app/auth/
│   ├── SignIn.tsx                   # reveal (FR-1049)
│   └── ReplaceCredential.tsx        # reveal; existing confirm aligned (FR-1050)
└── tests/

packages/platform/
├── src/interfaces/index.ts          # NEW — eighth capability: install state
└── src/web/                         # its web implementation

scripts/
├── generate-install-icons.mjs       # NEW — second source, separate crop (FR-1038..1044)
└── brand-audit.mjs                  # named upscale exception (FR-1045)

e2e/
└── responsive.spec.ts               # composer bound at three widths (SC-1001)
```

**Structure Decision**: No new package and no new application. The one structural addition is an
interface in `packages/platform`, which is where Principle V requires it. `apps/admin` gains no
dependency — its reveal control is its own, for the reason research R3 records.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **An eighth device capability, and a constitution amendment (v5.1.0) listing it** — Principle V's enumerated list currently names seven | FR-1031 requires knowing whether the application is running installed. The only way to ask is `matchMedia('(display-mode: standalone)')` plus a `beforeinstallprompt` listener, and Principle V forbids feature code from asking. The lint rule enforces this: `matchMedia` and `window` are both in its `DOM` set. | **A lint exemption for one call site** was rejected on the constitution's own reasoning for `VisibilityService`: *"an exemption would have traded a structural boundary for a poll interval."* The same trade here buys an install banner. **Detecting via the service worker** cannot work — a worker cannot report whether the page is standalone. **Always showing the guidance** contradicts FR-1031's "when, and only when" and nags anyone who has already installed. |
| **The password reveal control is implemented twice**, once per product | `apps/admin` depends on `@mynet/data` and `@mynet/config` only — deliberately not `@mynet/platform` — and no shared UI package exists. 013 established that the administrative site's absences are *"structural rather than configured"*. | **`packages/ui` holding one component** would give the administrative site its first dependency on shared presentation, which is the coupling that keeps the two information architectures independent. Revisit when a *second* shared control appears. Divergence is prevented by the same behavioural assertions running in both products, so a drift fails a build rather than being spotted by a person. |

**Neither is unjustified complexity, and neither is optional.** The first is Principle V working as
designed — it surfaced a platform dependency that the specification and its review gate both missed.
The second is the cost of the separate-product decision v4.0.0 made deliberately.

## Phase sequencing

The six stories are independent and could ship in any order. One ordering constraint and one
recommendation:

- **US5 must not start before the v5.1.0 amendment lands.** Writing the capability first and
  ratifying afterwards inverts the order this project has followed four times, and Principle V's list
  is the thing being changed.
- **US4 (mutual exchange) is the only story with server-side risk**, and the only one whose failure
  mode is silent. It is worth landing early enough that the induced-failure test (SC-1007) has time
  to be got right, rather than last against a deadline.

**Whether 016 splits into reviewable phases** is a decision for `speckit-spex-collab-phase-split`
against the concrete task list, as 007 and 008 both did. The natural seam is server (US4) against
client (US1, US2, US3, US5, US6), and the argument against splitting is that US4 is four
requirements of query change while the client half is the whole visible feature.

## Install-asset weights (FR-1048)

**T002 recorded the baseline before any asset changed; T064 records the result.** Kept here rather
than in a build log because FR-1048 asks for a *durable* place, and the comparison is the point: an
icon derived from a 114×133 source upscaled ~4× is expected to change weight, and a change nobody
wrote down is indistinguishable from one nobody noticed.

| Asset | Before (bytes) | After (bytes) | Change |
|---|---|---|---|
| `icons/icon-192.png` | 6,805 | 3,357 | −50.7% |
| `icons/icon-512.png` | 31,884 | 12,189 | −61.8% |
| `icons/icon-maskable-512.png` | 32,506 | 11,730 | −63.9% |
| `apple-touch-icon.png` | 6,201 | 3,178 | −48.8% |
| `favicon-16.png` | 514 | 811 | +57.8% |
| `favicon-32.png` | 1,143 | 1,462 | +27.9% |
| `favicon.ico` | 1,695 | 2,311 | +36.3% |
| **Total install assets** | **80,748** | **35,038** | **−56.6%** |
| **Precache** | 727.02 KiB, 23 entries | 736.99 KiB, **23 entries** | +9.97 KiB, ±0 entries |

**Every install asset got smaller and every favicon got larger, and both directions are the same
cause.** The old assets were a coral mark on a flat navy plate: large areas of one colour, which
PNG's filters compress extremely well at 512px and which leave a 16px favicon almost featureless.
The new mark is a gradient disc on white — at 512px the gradient costs far less than the navy field
it replaced, and at 16px there is genuinely more detail to encode than a two-colour glyph had.

**The precache grew by 9.97 KiB and its entry count did not move**, which is the number that
matters here. FR-1047 keeps install icons and favicons **out** of the precache set —
`includeManifestIcons: false` is what governs them, not `globIgnores`, because `vite-plugin-pwa`
re-adds manifest icons after the glob runs. So an **unchanged entry count across an icon change is
the evidence the exclusion survived**: had a single icon leaked in, the count would read 24 and the
total would have moved by tens of kilobytes rather than by ten.

The 9.97 KiB is this feature's client code — the composer bound, the poll and the pane observer,
two password fields, and the install guidance — none of which is an install asset. The icons
themselves became **45,710 bytes lighter** and not one byte of that reaches the precache, because
they were never in it.
