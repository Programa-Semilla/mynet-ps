---
description: "Task list for 010 — Brand mark and application icons"
---

# Tasks: Brand Mark and Application Icons

**Input**: Design documents from `/specs/010-brand-mark-and-app-icons/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/asset-declarations.md](./contracts/asset-declarations.md),
[quickstart.md](./quickstart.md)

**Tests**: **included and not optional here.** FR-832–FR-835 require a gate that does not exist
today — nothing asserts that a declared icon has a file — and FR-806 requires the pipeline be
provably deterministic. Both are only expressible as tests. **But this is also the first feature in
this project whose principal defects no test can see**, which is why Phase 10 is sign-off rather
than cleanup.

**⚠️ Read [research.md](./research.md) R1 before sizing the maskable icon.** The obvious reading of
"80% safe zone" is wrong and clips the node terminals. The safe zone is a **circle** of 80%
diameter, so the mark's bounding-box **diagonal** must fit it: 297.9px in a 512px icon.

**Organization**: grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: which user story the task serves

---

## ⚠️ Blocking precondition, before Phase 1

FR-849 requires the constitution amendment ratified **before** implementation begins.

- [X] T001 Confirm `.specify/memory/constitution.md` reads **Version: 3.3.0** and contains the
      "Brand identity and application icons" section, that register entry 2 is struck through, that
      entry 22 exists, and that entry 4 is **still open** — FR-846, FR-847, FR-848, FR-849 and
      FR-850 respectively (satisfied 2026-08-10; re-check after any rebase, which is when it could
      be lost)

---

## Phase 1: Setup

**Purpose**: put the brand source where it belongs and make the pipeline's dependency resolvable.

- [X] T002 `git mv seeds/logo.png assets/brand/logo.png` and commit it as tracked (FR-800, FR-801) —
      it is currently untracked
- [X] T003 Remove the now-empty `seeds/` directory (FR-802) — an empty directory named for database
      seed data is the collision the move exists to remove
- [X] T004 Add `sharp` (`^0.35.3`, matching `apps/api`) to **root** `devDependencies` in
      `package.json` and run `pnpm install` — `.npmrc` sets `shamefully-hoist=false`, so a root
      script cannot resolve `apps/api`'s copy (research R7)
- [X] T005 [P] Grep the repository for `seeds/logo.png` and confirm **zero** remaining references
      outside this feature's own specification history (FR-802, SC-813)

**Checkpoint**: the source is tracked at its final path and `node -e "import('sharp')"` resolves
from the repository root.

---

## Phase 2: Foundational — the derivation pipeline

**⚠️ CRITICAL**: every asset in every later phase is an output of this script. No user story work
can begin until this phase is complete.

**Purpose**: one readable script, one alpha matte, deterministic output (FR-804–FR-809).

- [X] T006 Create `scripts/generate-brand-assets.mjs` with its constants stated as readable values
      at the top: expected board dimensions `1254×1254`, crop `{left:172, top:162, width:283,
      height:300}`, plate `#0d1942`, mark `#fe6551` (FR-805)
- [X] T007 In the same file, write the reasoning for the brand constants beside their definition
      (FR-809): they are **identity, not palette**, measured from the board, and deliberately do not
      move when a design token moves. Note that `mynet/no-colour-literals` does not cover `scripts/`
      (research R8), so this is documentation rather than a lint exemption
- [X] T008 Add a source assertion that reads the board's real dimensions and **fails loudly** naming
      what it expected, rather than cropping a meaningless rectangle from a different image (FR-807)
- [X] T009 Implement the alpha matte: `α = clamp((P.red − 0x0d) / 241, 0, 1)` per pixel, RGB set to
      the mark colour, output RGBA at 283×300 (research R2). The red channel is chosen because its
      coral/navy delta is 241 of 255 — the largest of the three
- [X] T010 Implement `plate(matte, size, markHeight)` — resample the matte with a Lanczos filter and
      centre it on an **opaque** square of the plate colour
- [X] T011 Implement `bare(matte, height, colour)` — resample onto **transparency**, painting the
      matte any colour, for the in-app marks (FR-820a)
- [X] T012 Implement `maskableMarkHeight(size)` returning `2 × (0.8 × size / 2) / hypot(283/300, 1)`
      — the largest bounding box whose **diagonal** fits the 80%-diameter safe circle (FR-811,
      research R1). Comment it with why the naive `0.8 × size` is wrong
- [X] T013 [P] Create `scripts/generate-brand-assets.test.mjs` asserting the geometry: at 512 the
      maskable mark height is ≈297.9, its bounding-box corner is ≤204.8px from centre, and the
      naive `0.8 × size` sizing would be **rejected** at 281.5px. This test is the R1 defect,
      pinned so it cannot come back
- [X] T014 [P] Extend that test with the unmix maths: α is 0 at the plate colour, 1 at the mark
      colour, and 0.5 at their midpoint
- [X] T015 Wire the CLI entry point, create output directories, and make every write go through one
      place so the asset inventory is readable in one glance

**Checkpoint**: `node scripts/generate-brand-assets.mjs` runs, `pnpm test:unit` is green, and the
geometry is pinned.

---

## Phase 3: User Story 1 — Install MyNet and recognise it (Priority: P1) 🎯 MVP

**Goal**: the home-screen icon is the MyNet mark on the brand plate, correct under a circular mask,
and opaque on iOS.

**Independent test**: install the built application and look at the resulting icon at its rendered
size and under a circular mask.

- [X] T016 [US1] Generate `apps/web/public/icons/icon-192.png` at 192×192 on the opaque plate, replacing
      the provisional file **at the same name and size** (FR-810)
- [X] T017 [US1] Generate `apps/web/public/icons/icon-512.png` at 512×512, same name and size (FR-810).
      No safe-zone constraint applies — the fill fraction is a design choice (research R1)
- [X] T018 [US1] Generate `apps/web/public/icons/icon-maskable-512.png` using `maskableMarkHeight(512)`
      (FR-811). **Do not size the mark to 80% of the side**
- [X] T019 [US1] Generate `apps/web/public/apple-touch-icon.png` at 180×180 with a **fully opaque** plate
      (FR-812) — iOS ignores `purpose: maskable` and renders transparency as black, so this cannot
      be the maskable file under another name
- [X] T020 [P] [US1] Add an assertion to `scripts/generate-brand-assets.test.mjs` that the apple-touch
      asset contains **zero** pixels with alpha < 255 (SC-803)
- [X] T021 [US1] Commit the four generated assets (FR-808) and confirm none carries the placeholder's
      disc or amber diagonal band (FR-814, SC-801)
- [X] T022 [US1] Render the maskable icon through a circular mask locally and confirm **both node
      terminals survive** in `apps/web/public/icons/icon-maskable-512.png` — the specific failure
      research R1 caught. 100% of the mark inside the safe zone (SC-802)

**Checkpoint**: the install icons exist, are correct under a mask, and the amber band is gone.

---

## Phase 4: User Story 2 — Find the MyNet tab (Priority: P1)

**Goal**: every tab, bookmark and pinned tab carries the mark. `index.html` has **neither** a
favicon link nor an apple-touch-icon today, so this contract is created, not modified.

**Independent test**: load the application and inspect a tab, a bookmark and a pinned tab.

- [X] T023 [P] [US2] Generate `apps/web/public/favicon-32.png` and `favicon-16.png` on the opaque
      plate, downscaled from the 300px master with a Lanczos filter that preserves the round caps
      (FR-817, FR-818)
- [X] T024 [US2] Implement a minimal ICO writer in `scripts/generate-brand-assets.mjs` — 6-byte
      header, one 16-byte directory entry per image, PNG payloads verbatim — and emit
      `apps/web/public/favicon.ico` containing the 16 and 32 (research R9)
- [X] T025 [US2] Add the `<link rel="icon">` (16 and 32) and `<link rel="apple-touch-icon">` (180)
      tags to `apps/web/index.html` (FR-813, FR-816)
- [X] T026 [US2] Confirm `<title>` and the description meta in `index.html` are **unchanged** —
      FR-049's single branding constant remains the source of the product name (FR-819)
- [X] T027 [US2] Tune the small-size fill fraction by eye against the board's own 32/24/16 scale
      tests and regenerate. Research R4 found 16px recognisable but soft; **32px is the size that
      must be right**, because that is what hidpi displays request (FR-818a)

**Checkpoint**: no surface shows the browser's default document glyph (SC-804).

---

## Phase 5: User Story 5 — A declared icon with no file fails (Priority: P2)

**Goal**: close the hole where a manifest can name a missing file while all ten correctness gates
pass, and the failure appears only when a real device tries to install.

**Independent test**: declare an icon with no file; confirm the gate fails. Remove a declared file;
confirm the gate fails.

**Depends on**: Phases 3 and 4 — there must be declarations to derive expectations from.

- [X] T028 [US5] Create `apps/web/src/app/icons.ts` holding the icon declarations as pure data
      (`src`, `sizes`, `type`, `purpose`), following the `branding.ts` precedent that
      `vite.config.ts` already imports from (research R5)
- [X] T029 [US5] Point `apps/web/vite.config.ts` at that module so the manifest has **one** source
      of icon declarations. Leave `readColourToken` where it is — it does file I/O the browser
      program must never see, and FR-829 keeps `theme_color`/`background_color` token-derived
- [X] T029a [US5] **Declare the apple-touch icon in the manifest** alongside the existing three, at
      its true size (FR-828). It is generated by T019 and linked from `index.html` by T025, and
      without this it is the one asset the gate derives no expectation from — an undeclared asset is
      an unchecked one, which is the hole this whole phase exists to close
- [X] T030 [US5] Create `apps/web/tests/unit/icon-declarations.test.ts` asserting every declared
      `src` resolves to a file under `apps/web/public` (FR-832, C1.1)
- [X] T031 [US5] Add a dependency-free PNG dimension reader (IHDR: width at byte 16, height at 20,
      big-endian) and assert every file's **actual** dimensions equal its declared `sizes` (FR-833)
- [X] T032 [US5] Extend the test to parse `apps/web/index.html` for `rel="icon"` and
      `rel="apple-touch-icon"` hrefs and apply the same two checks (C2.1, C2.2)
- [X] T033 [US5] Assert the declarations contain **no** `purpose: "monochrome"` (FR-841) and that
      the test needs **no allow-list** to pass on what this feature ships (FR-834)
- [X] T034 [US5] **Prove the gate fails**: temporarily remove a declared file, run `pnpm test:unit`,
      confirm a failure naming the declaration *and* the expected path; then point a 192 declaration
      at the 512 file and confirm the dimension failure. Restore both (SC-810). A test that only
      ever passes is the "gate that does not fail when broken" this project has shipped before
- [X] T035 [US5] Confirm `apps/web/tests/unit/icon-declarations.test.ts` runs inside `pnpm verify`
      via the `unit` project rather than as a manual step (FR-835)
- [X] T035a [US5] Perform the re-check the icons README's replacement checklist asks for: that
      `background_color` (cream-100) and `theme_color` (navy-800) still suit the mark (FR-830).
      **Record the finding** — that the icon plate `#0d1942` and `theme_color` `#1b2340` differ, and
      that the seam is an accepted interim cost under register entry 22 — in the rewritten README
      (T063). Performing it and not writing it down is how it gets rediscovered as a defect

**Checkpoint**: a newly declared icon with no file **fails by existing**.

---

## Phase 6: User Story 3 — The mark in the shell, at every width (Priority: P2)

**Goal**: the mark is present at all three width bands and on all five authentication screens,
without displacing a control or changing anything a screen reader reads.

**Independent test**: visit each destination at 320px, tablet and desktop widths, then each of the
five authentication screens.

- [X] T036 [US3] Generate `apps/web/public/brand/mark-coral.png` and `mark-navy.png` at ≈96px tall
      with **no plate** (FR-820a) — both from the one matte, painted twice (FR-820b)
- [X] T037 [US3] Create `apps/web/src/shell/BrandMark.tsx`: a presentational component taking the
      colourway, rendering an `<img>` that is `aria-hidden` with empty alt text, `shrink-0`, sized
      by CSS (FR-820, FR-821)
- [X] T038 [US3] Add the mark to `apps/web/src/shell/DesktopRail.tsx` beside the product name, in
      the **coral** colourway — the rail is `bg-surface-inverse`, and a navy mark there is invisible
      while passing every assertion (FR-822, FR-820b)
- [X] T039 [US3] Add the mark to `apps/web/src/shell/TopBar.tsx` in the **navy** colourway, visible
      at the mobile and tablet bands only and **hidden at desktop** where the rail carries it
      (FR-823, FR-824). Band selection in CSS, never in JavaScript (FR-827)
- [X] T040 [US3] Size and constrain the top-bar mark so that at 320px the conference switcher, the
      profile control and the sign-out control are **untouched** — the label yields first, as
      `TopBar`'s own comment already requires (FR-825)
- [X] T041 [P] [US3] Add the stacked mark above the heading in `apps/web/src/auth/SignInScreen.tsx`
      (FR-826) — the only screen whose `<h1>` is the product name
- [X] T042 [P] [US3] Same in `apps/web/src/app/auth/SignUp.tsx`
- [X] T043 [P] [US3] Same in `apps/web/src/app/auth/Verify.tsx` — heading text
      `Verify your email address` stays exactly as it is
- [X] T044 [P] [US3] Same in `apps/web/src/app/auth/ResetRequest.tsx`
- [X] T045 [P] [US3] Same in `apps/web/src/app/auth/ResetPassword.tsx`
- [X] T046 [US3] Component test: each surface references the **expected colourway asset** — light
      surfaces the navy mark, the inverse surface the coral one (research R11, SC-814). This catches
      the swap, which is the mistake that actually happens
- [X] T047 [US3] Component test: every existing accessible name, heading and landmark is unchanged,
      and the mark is **not** announced (FR-821, SC-807)
- [X] T047a [US3] Unit test: each colourway meets **≥ 3:1 non-text contrast (WCAG 1.4.11)** against
      the surface it sits on, computed from the two known colours rather than from a rendering
      (FR-820c). Measured headroom: coral on `navy-800` is **5.29:1**, brand navy on the raised
      surface is **17.01:1**, and the icon's coral on brand navy is **5.83:1**. 3:1 is the graphical
      -object threshold; the mark is not text. The accessibility suite cannot cover this — axe does
      not evaluate an `aria-hidden` decorative image, which is why it needs its own assertion
- [X] T048 [US3] Extend `e2e/responsive.spec.ts`: **exactly one** mark is visible at each width band
      — and specifically **not two** at desktop (FR-824, SC-805)
- [X] T049 [US3] Extend `e2e/responsive.spec.ts`: with the mark present, no destination overflows
      horizontally at any width from 320px, and the switcher, profile and sign-out controls are all
      still present at 320px (FR-825, SC-806)
- [X] T050 [US3] Run `pnpm test:a11y` and confirm the accessibility suite passes unchanged

**Checkpoint**: the mark is in the shell at every band, and nothing it touched regressed.

---

## Phase 7: User Story 1 (continued) — Manifest screenshots

**Goal**: a rich install prompt shows MyNet rather than a name and an icon — without putting
megabytes into the install download.

**Sequencing**: screenshots are captured **from the built application**, so they must be captured
**before** they are declared, or Phase 5's gate fails on files that do not exist (research R6).

- [X] T051 [US1] Create `e2e/support/capture-screenshots.ts` driving the existing Playwright stack —
      `playwright.config.ts` already builds and serves a production client, `global-setup.ts` seeds
      the database, and `e2e/support/attendees.ts` supplies signed-in fixtures (FR-815c)
- [X] T052 [US1] Capture narrow and wide screenshots of real current surfaces into
      `apps/web/public/screenshots/` and commit them (FR-815a, FR-815b)
- [X] T053 [US1] Review every captured image for personal data. Seeded fixture data only — no real
      address, avatar photograph or message text. **The repository is public**, so a committed
      screenshot is world-readable permanently (FR-815e)
- [X] T054 [US1] Add `'screenshots/**'` to `injectManifest.globIgnores` in `apps/web/vite.config.ts`
      beside the existing `'**/*.map'` (FR-815d)
- [X] T055 [US1] Declare the screenshots in the manifest with `sizes`, `type` and `form_factor`
      (C1 shape), now that the files exist
- [X] T056 [US1] Assert exclusion: build, then confirm `apps/web/dist/sw.js` contains **zero**
      `screenshots/` entries and **does** contain the icons (SC-815, quickstart scenario 4)

**Checkpoint**: the install prompt is illustrated and the install download did not grow by it.

---

## Phase 8: User Story 4 — A reviewer verifies without opening a binary (Priority: P2)

**Goal**: the crop geometry, plate colour and safe-zone inset are verifiable by reading code.

**Independent test**: read the script; regenerate on a clean checkout and confirm no diff.

- [X] T057 [US4] Verify determinism: run `node scripts/generate-brand-assets.mjs` on a clean tree
      and confirm `git status --short apps/web/public/` prints **nothing** (FR-806, SC-809). This is
      also what proves **FR-803** — a hand-edited asset or a second source of the mark shows up here
      as a diff that regeneration cannot reproduce
- [X] T058 [US4] Verify the loud failure: move the board aside, run the script, confirm `scripts/generate-brand-assets.mjs`
      names what it expected and emits **no** asset; restore (FR-807)
- [X] T059 [US4] Read `scripts/generate-brand-assets.mjs` as a reviewer would and confirm every
      value FR-805 names is present and legible without running anything

**Checkpoint**: the convention the provisional generator established survives its replacement.

---

## Phase 9: User Story 6 — The next person knows where the mark came from (Priority: P3)

**Goal**: the icons README describes what is actually on disk.

- [X] T060 [US6] Delete `scripts/generate-provisional-icons.mjs` (FR-836)
- [X] T061 [US6] Grep the repository for references to `scripts/generate-provisional-icons.mjs`
      and fix every one, `apps/web/public/icons/README.md` included (FR-836)
- [X] T062 [US6] Measure the total added **precached** weight of `apps/web/public/` and record it
      as a number
      (FR-815, SC-817) — no gate measures it, because `scripts/asset-budget.mjs` walks the build
      manifest's entry chunk and gzips only `.js` (research R8 / plan)
- [X] T063 [US6] Rewrite `apps/web/public/icons/README.md` (FR-837): the brand source, the
      regeneration command, the asset inventory, the recorded weight from T062, and the note that
      the plate colour is a **brand constant** that deliberately does not move with a design token.
      Its "PROVISIONAL, NOT BRANDING" framing must not survive assets that are neither
- [X] T063a [US6] **Book** the deferred work as named follow-ups rather than leaving it noted in
      prose — a record in the delivery roadmap's 010 section and this feature's directory, one each:
      the **iOS `apple-touch-startup-image` splash matrix**, which must carry the precache exclusion
      with it (FR-840); the **`purpose: "monochrome"` variant** (FR-841); and the **vector redraw**
      (FR-842), whose reason is resolution independence for sizes not yet asked for and **not**
      present degradation — research R1 established that nothing this feature ships is upscaled
- [X] T064 [P] [US6] Confirm the governance and planning documents corrected during the amendment
      are still accurate — `CLAUDE.md`, `brainstorm/00-overview.md` and the delivery roadmap's 010
      section (FR-838, FR-839, SC-816)

**Checkpoint**: nothing in the repository still claims MyNet has no logo.

---

## Phase 10: Polish and by-hand validation

**⚠️ This phase is the feature's real verification, not its cleanup.**

Every automated gate above can pass on a mark that is present, decorative, correctly sized in the
DOM — and twice too large, in the wrong place, or crowding the sign-out control. 007 and 008 both
shipped with their by-hand walkthrough outstanding, and 008's is how a dialog rendering in the
**top-left corner** was found after passing 135 end-to-end tests, five review agents and CodeRabbit.

- [X] T065 Run `pnpm verify` at the repository root, end to end, and confirm all ten gates are
      green — including that the asset budget has **not** moved (FR-843, SC-812) and the
      colour-literal count has **not** risen (SC-811) — **exit 0**; unit 450, component 539,
      integration 830, e2e 139, a11y 28. The budget total is **153.0 KB, identical at `HEAD` under
      the same `.env`**; the 150 KB overage is a pre-existing local artifact (the `.env` sets
      `NODE_ENV=development`, so the build bundles development React and the tool says so)
- [X] T065a Verify this feature's four absences, each cheap and each the kind that stops being true
      once nobody checks: **no design token changed value** (`git diff apps/web/src/theme/tokens.css`
      is empty — FR-831); **no attendee data is collected, stored or transmitted and no network
      request was added** (FR-844); **no schema change, migration or seed-data change** (`git diff`
      touches neither `apps/api/migrations/` nor `apps/api/src/db/` — FR-845); and **no second
      source of the mark exists** (FR-803, established by T057)
**⚠️ T066–T070 are NOT done. They need a phone and a person, and no gate substitutes.** What was
and was not checked is written up per scenario in [delivery-record.md](./delivery-record.md); the
summary is that 1–4 and 10 are complete, 6–8 were done by *rendering and measuring* rather than by
*using*, and 5 and 9 were not done at all.

- [ ] T066 Walk [quickstart.md](./quickstart.md) **scenario 5** — install on a device, inspect the
      home-screen icon, the circular mask and iOS opacity, and confirm the splash shows the accepted
      navy seam **and nothing else** — **NOT DONE: needs a device**
- [ ] T067 Walk **scenario 6** — the tab strip, including the 16px legibility judgement FR-818a
      assigns to a human. If it does not read as the MyNet "N", tune and regenerate; do not accept it
      — **PARTLY: rendered and compared by eye against the board's own 32/24/16 scale tests (32px
      clean, 16px legible but soft, as research R4 predicted); not seen in a real tab strip**
- [ ] T068 Walk **scenario 7** — the shell at 320px, tablet and desktop. Position, size and
      colourway. This is register entry 4 territory and the reason it is escalated — **PARTLY:
      rendered at 390 and 1280 and measured at thirteen widths; not reviewed by the owner, which is
      the half that matters. One finding — the mobile top bar truncates "MyNet" to "M…", and it did
      so before this feature; see the delivery record**
- [ ] T069 Walk **scenario 8** — all five authentication screens carry the mark in the stacked
      arrangement, headings unchanged (SC-808) — **PARTLY: asserted structurally at component level
      and for overflow at thirteen widths, and rendered and looked at at 390px, which is how the
      arrangement defect below was found. Not walked on all five by hand.** The mark was first
      implemented left-aligned; the owner settled FR-826 as the header block centred **as a unit**,
      and it was corrected. See the delivery record
- [ ] T070 Walk **scenario 9** — screen reader: the mark is silent, everything else is unchanged —
      **NOT DONE: asserted by tests and axe, but no screen reader was run**
- [X] T071 Update `spec.md` Status to reflect delivery, and record in the feature directory which
      quickstart scenarios were actually walked — **honestly**, including any that were not —
      recorded in [delivery-record.md](./delivery-record.md)

---

## Dependencies

```text
T001 (amendment ratified)
  └─► Phase 1: Setup (T002–T005)
        └─► Phase 2: Pipeline (T006–T015)   ⚠️ blocks everything
              ├─► Phase 3: US1 install assets (T016–T022)  🎯 MVP
              │     └─► Phase 7: US1 screenshots (T051–T056)   [also needs a working build]
              ├─► Phase 4: US2 browser chrome (T023–T027)
              ├─► Phase 6: US3 in-app mark (T036–T050)
              └─► Phase 8: US4 pipeline verification (T057–T059)

        Phase 3 + Phase 4 ──► Phase 5: US5 the gate (T028–T035)
                                  (needs declarations to derive from)

        Phases 3–8 ──► Phase 9: US6 housekeeping (T060–T064)
                          └─► Phase 10: verify + by-hand sign-off (T065–T071)
```

**Story independence**: US1, US2, US3 and US4 are independent of each other once the pipeline
exists. US5 depends on US1 and US2 having produced declarations. US6 is last because it documents
what the others produced.

---

## Parallel opportunities

- **Phase 1**: T005 runs alongside T002–T004.
- **Phase 2**: T013 and T014 (the two test files' contents) are independent of each other.
- **Phase 3 ∥ Phase 4 ∥ Phase 6**: three different asset families and three different file sets —
  install icons, browser chrome, in-app marks. Only the shared generator file couples them, and by
  Phase 3 it is finished.
- **Phase 6**: T041–T045 are five separate authentication screens, one file each, fully parallel.
- **Phase 8**: T057–T059 are read-only verifications and can run alongside Phase 9.

---

## Implementation strategy

**MVP is Phase 1 + Phase 2 + Phase 3.** That alone replaces the amber-banded placeholder with the
real mark on the home screen, which is the release blocker register entry 2 has been holding open
since 1.0.0. Everything after it is real value but none of it is the blocker.

**Recommended increments**:

1. **Increment 1** — Phases 1–3. The install icons are right. Ship-able as its own review.
2. **Increment 2** — Phases 4–5. Browser chrome, plus the gate that stops either family regressing.
3. **Increment 3** — Phase 6. The in-app mark, which is the largest surface-area change and the one
   touching seven files other features own.
4. **Increment 4** — Phases 7–9. Screenshots and housekeeping.
5. **Sign-off** — Phase 10, which is not optional for a feature whose entire deliverable is visual.

**If Phase 10 cannot be completed before merge**, say so explicitly in the pull request rather than
letting it lapse silently. That is exactly how 007's and 008's walkthroughs became outstanding, and
this feature has less excuse than either: there is nothing here that a person cannot check in
fifteen minutes with a phone and a browser.
