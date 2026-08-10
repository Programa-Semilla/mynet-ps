# Implementation Plan: Brand Mark and Application Icons

**Branch**: `docs/brand-mark-and-app-icons` (spec) → `feat/010-brand-mark-and-app-icons`
(implementation) | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-brand-mark-and-app-icons/spec.md`

## Summary

Carry the owner-supplied brand mark into the product: replace the three deliberately-ugly
provisional icons, add the favicon set and `apple-touch-icon` that `index.html` has never had, put
the mark on the rail, the top bar and the five authentication screens, declare manifest screenshots,
and add the gate that fails a declared icon with no file.

**The technical approach is one idea.** The board has no alpha channel, so a crop carries its navy
into every antialiased edge. Unmixing that composite algebraically — `α = (P−B)/(F−B)` on the red
channel, where the coral/navy delta is 241 of 255 — recovers a clean **alpha matte** in one step.
Every asset is then that matte, resampled and painted: onto an opaque brand-navy plate for the
install icons and favicons, onto nothing for the two in-app colourways. Measured on the real crop,
98% of pixels resolve to fully opaque or fully transparent, which is the signature of a clean
vector-drawn shape; the result renders with no halo at any plate colour.

**Planning found one defect in the specification and corrected it.** The maskable safe zone is a
**circle** of 80% diameter, not 80% of the side available to a bounding box. Sized the way the spec
originally described, the mark's corners sit 281px from centre against a safe radius of 204.8 — so
an Android circular mask would clip the node terminals, which are the whole idea of the mark. The
correct size is 297.9px in a 512px icon: **0.993× of native, no upscale anywhere in the feature**.
See research R1; the spec, `CLAUDE.md` and the brainstorm overview were corrected.

## Technical Context

**Language/Version**: TypeScript 6.0.3 (client, tests), JavaScript ESM (`.mjs`, generation script),
Node ≥ 22

**Primary Dependencies**: `sharp ^0.35.3` — **added to root `devDependencies`** (currently an
`apps/api` dependency only, and `.npmrc` sets `shamefully-hoist=false`, so a root script cannot
resolve it today). `vite-plugin-pwa` and Playwright are already present. **No new client dependency
whatsoever** — the mark is a static asset, not a bundled import.

**Storage**: N/A — no table, no column, no migration, no seed data, no attendee data of any kind.

**Testing**: Vitest `unit` project (node environment, already globs
`apps/web/tests/unit/**/*.test.ts` and `scripts/**/*.test.mjs`), Vitest `component`, Playwright for
the responsive assertions and for screenshot capture.

**Target Platform**: Installable PWA. The consumers of this feature's output are **platform install
machinery and browser chrome** — the first feature here whose primary consumer is not the
application itself.

**Project Type**: Web application (pnpm workspace: `apps/web`, `apps/api`, `packages/*`).

**Performance Goals**: Shell JavaScript unchanged — the asset budget must not move (SC-812). Install
payload growth is bounded by the derived assets and **stated as a number in the icons README**
(FR-815), because no gate measures it.

**Constraints**: No horizontal scrolling at any width from 320px, with a new element added to the
tightest row in the product. Zero change to any accessible name, heading or landmark. Zero design
tokens changed. Screenshots excluded from precache.

**Scale/Scope**: ~9 committed assets, 7 surfaces gaining a mark, 1 new gate, 1 script replaced,
1 script deleted, 4 documents already corrected by the ratified amendment.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design. **Both passes clean.***

| Principle | Assessment |
|---|---|
| **I — Requirements define the product** | **PASS.** No mark is invented; the owner supplied one, which is what closed register entry 2. The feature adds no capability `requirements.md` does not name — a brand mark and icons are product identity, not a new surface. The amendment deliberately does **not** close register entry 4, because taking it would answer a question nobody asked. |
| **II — Prototype is reference, not architecture** | **PASS.** The prototype has no mark and no desktop layout; nothing is inherited from it here. |
| **III — Attendee experience first** | **PASS.** No organizer surface, no privileged role, no admin path. The attendee is still the only actor; assets are identical for everyone. |
| **IV — Accessibility and responsiveness** | **PASS, and it is the principle carrying the most risk.** The mark is decorative and changes no accessible name (FR-821). No control is added, so no new label, focus state or keyboard path — and FR-825 forbids displacing an existing one at 320px. Band selection is CSS-only, so exactly one mark is in the accessibility tree at any width. **What this principle cannot cover is position and size**, which is register entry 4 and is why quickstart scenarios 5–9 are mandatory sign-off rather than optional. |
| **V — Abstraction before platform and data APIs** | **PASS.** No browser API is called and no network request is made. No new device capability is needed, so `substitution.test.ts` is untouched — the seventh capability count stands. Width bands are chosen in CSS precisely so `mynet/no-direct-platform-access` is respected rather than exempted. |
| **VI — Web-first delivery** | **PASS, and this feature is squarely in service of it.** FR-050's installability was satisfied by a placeholder that declared itself provisional; this is that plan completing. Offline behaviour is unchanged: assets are precached with the shell, screenshots deliberately are not. No Capacitor trigger is approached. |
| **VII — Verified on Linux CI** | **PASS.** Everything runs on Linux: `sharp` has prebuilt Linux binaries, the gate is a node-environment unit test, and screenshot capture reuses the existing Playwright stack. **No Apple infrastructure is required to build or verify** — the iOS-specific obligations (opaque apple-touch icon) are asserted by pixel inspection in the test, not by an Apple device. The physical iPhone test remains a separate release obligation. |
| **VIII — Attendee data is personal data** | **PASS, with one live obligation.** The feature stores and transmits no attendee data, so identity scoping and cascade coverage are "not applicable, because…" rather than silence. **The obligation that does attach is FR-815e**: screenshots depict product surfaces, the repository is **public**, and a committed screenshot is world-readable forever. Seeded fixture data only — which the capture method guarantees by construction, since the end-to-end stack contains nothing else. |
| **IX — Every feature declares its own completeness** | **PASS.** All nine obligations are declared in the spec's Feature Declarations table, five of them as explicit "not applicable, because…". Nothing is deferred to a later polish pass. |

**Governance**: constitution **v3.3.0 ratified 2026-08-10**, closing register entry 2 and satisfying
FR-849's precondition that ratification precede implementation. The rule now lives in the binding
block *"Brand identity and application icons"*.

**One clause is softer than the constitution states, and it is recorded rather than quietly left.**
The new block argues the plate MUST be brand navy *because* the board's edges are blends against it.
With a correctly unmixed matte (research R2) the halo does not arise at any plate colour, so that
mechanical necessity is weaker than written. **The decision is unchanged** — owner decision B3 put
the brand's colours on the icon on brand grounds, which never depended on the mechanics. Flagged so
the next reader is not misled by an argument that is stronger in prose than in fact.

**No complexity deviation.** The Complexity Tracking table below is empty because there is nothing to
justify: one new devDependency, no new abstraction, no new pattern, and one new test that follows an
existing one.

## Project Structure

### Documentation (this feature)

```text
specs/010-brand-mark-and-app-icons/
├── spec.md                            # Corrected at planning — see research R1
├── plan.md                            # This file
├── research.md                        # Phase 0 — 11 findings, all measured
├── data-model.md                      # Phase 1 — derivation graph; no DB entity
├── quickstart.md                      # Phase 1 — 10 scenarios; 5–9 are by hand
├── contracts/
│   └── asset-declarations.md          # Phase 1 — three declaration contracts
├── checklists/
│   └── requirements.md                # Spec quality + review-spec gate record
└── tasks.md                           # Phase 2 — NOT created by /speckit-plan
```

### Source code (repository root)

```text
assets/brand/
└── logo.png                           # NEW — moved from seeds/ (FR-801); seeds/ removed (FR-802)

scripts/
├── generate-brand-assets.mjs          # NEW — replaces the provisional generator
├── generate-provisional-icons.mjs     # DELETED (FR-836)
└── generate-brand-assets.test.mjs     # NEW — matte maths + safe-circle geometry

apps/web/
├── index.html                         # MODIFIED — favicon + apple-touch links (had NEITHER)
├── vite.config.ts                     # MODIFIED — icons from the shared module; screenshots;
│                                      #            globIgnores for screenshots
├── src/
│   ├── app/
│   │   └── icons.ts                   # NEW — declarations shared by config and gate (R5)
│   ├── shell/
│   │   ├── BrandMark.tsx              # NEW — one component, colourway per surface
│   │   ├── DesktopRail.tsx            # MODIFIED — coral mark (inverse surface)
│   │   └── TopBar.tsx                 # MODIFIED — navy mark, mobile + tablet bands only
│   ├── auth/SignInScreen.tsx          # MODIFIED — stacked mark above the heading
│   └── app/auth/{SignUp,Verify,ResetRequest,ResetPassword}.tsx   # MODIFIED — same
├── public/
│   ├── icons/{icon-192,icon-512,icon-maskable-512}.png           # REPLACED, same names/sizes
│   ├── icons/README.md                # REWRITTEN (FR-837) — carries the install-weight figure
│   ├── apple-touch-icon.png           # NEW — opaque, 180 (FR-812)
│   ├── favicon-{16,32}.png, favicon.ico                          # NEW (FR-816, R9)
│   ├── brand/mark-{coral,navy}.png    # NEW — no plate (FR-820a)
│   └── screenshots/*.png              # NEW — captured, precache-excluded (FR-815d)
└── tests/unit/
    └── icon-declarations.test.ts      # NEW — the gate (FR-832–FR-835)

e2e/
├── responsive.spec.ts                 # MODIFIED — exactly one mark per band; no displacement
└── support/capture-screenshots.ts     # NEW — regenerable capture (FR-815c)

package.json                           # MODIFIED — sharp as a root devDependency (R7)
```

**Structure Decision**: no new package, no new layer. The generation script joins `scripts/`, where
the outgoing generator already lives and where the unit project already globs `*.test.mjs`; the
declarations join `apps/web/src/app/` beside `branding.ts`, which `vite.config.ts` already imports
for exactly this reason; the gate joins `apps/web/tests/unit/` beside `service-worker.test.ts`,
which is the established shape for a source-level guard here.

## Implementation phases

Ordering is driven by one constraint from research R6: **screenshots are captured from the built
application, so they must be captured before they are declared.**

| Phase | Work | Gates it must leave green |
|---|---|---|
| **1 — Source and pipeline** | Move the board to `assets/brand/`, remove `seeds/`, add `sharp` to root devDependencies, write `generate-brand-assets.mjs` with the matte derivation and its geometry test | lint, typecheck, unit |
| **2 — Install and chrome assets** | Generate and commit icons, apple-touch, favicons, `.ico`; add the head links | unit, build |
| **3 — The gate** | Extract `icons.ts`, point `vite.config.ts` at it, write `icon-declarations.test.ts` — **and prove it fails** before trusting that it passes | unit |
| **4 — The in-app mark** | `BrandMark.tsx`, then rail, top bar and the five auth screens; component assertions for colourway per surface; responsive assertions for one-mark-per-band and no displacement at 320px | component, e2e, a11y |
| **5 — Screenshots** | Capture script, capture, `globIgnores`, then declare in the manifest | build, unit, e2e |
| **6 — Housekeeping** | Delete the provisional generator, rewrite the icons README with the install-weight figure, verify no stale reference to `seeds/` or to the old script | full `pnpm verify` |
| **7 — By-hand validation** | `quickstart.md` scenarios 5–9 | Human sign-off — no gate substitutes |

**Phase 7 is not optional.** 007 and 008 both shipped with their by-hand walkthrough outstanding, and
008's is how the top-left dialog was found. For a feature whose entire deliverable is visual,
skipping it would leave nothing verified at all.

## Complexity Tracking

> Empty by design. The Constitution Check passed on both evaluations with no violation to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | — | — |
