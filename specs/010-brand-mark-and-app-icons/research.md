# Phase 0 Research: Brand Mark and Application Icons

**Feature**: 010 | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

Every finding below was produced by running code against this repository and against the brand
board, not by reasoning about them. Where a measurement contradicts the specification, the
measurement wins and the specification has been corrected — R1 is that case, and it would have
shipped a clipped icon.

---

## R1 — The maskable safe zone is a CIRCLE, and the spec's headline measurement was wrong

**Decision**: The maskable mark is **297.9px tall in a 512px icon — a 0.993× scale of the board's
native 300px mark. Nothing in this feature is upscaled.**

**What the spec said**: *"Filling a 512 icon at the 80% maskable safe zone is therefore a 1.37×
upscale"*, and consequently *"only the two 512s are degraded"*, and consequently FR-842's
justification that a vector redraw must be booked *"or the 1.37×-upscaled 512s become permanent by
default."* All three follow from one misreading.

**What is actually true**: the maskable safe zone is **a circle whose diameter is 80% of the icon's
smallest dimension** — not 80% of the side available to a bounding box. The distinction is the whole
finding, because a rectangle's corners escape a circle:

| Sizing | Mark bbox in 512 | Corner distance from centre | Safe radius (204.8) |
|---|---|---|---|
| Bbox fills 80% of the **side** (the spec's reading) | 386×410 | **281.5px** | **37% OUTSIDE** |
| Bbox fits inside the safe **circle** (correct) | 281×298 | 204.8px | exactly inside |

Built to the spec's reading, **the two node terminals — the feature of the mark — sit outside the
safe zone and an Android circular mask clips them.** Rendered and confirmed both ways.

**Consequences, all three of which change the feature**:

1. FR-811 ("keep the entire mark inside the 80% safe zone") was always correct and is what this
   research verifies. The *measurement narrative* around it was not, and an implementer following
   the narrative rather than the requirement would have produced a clipped icon that no test catches.
2. **The vector redraw loses its stated urgency.** Nothing is degraded, so it is not preventing a
   soft asset from becoming permanent. It remains worth booking — a vector source is resolution-free
   for any size added later, and it is the input a monochrome variant would want — but the honest
   reason is *future flexibility*, not *present degradation*.
3. The standard (non-maskable) icon has no safe-zone constraint at all, so its size is a design
   choice. At the 0.62 fill trialled it renders the mark 317px tall — a 1.06× scale, visually
   indistinguishable from native.

**Alternatives considered**: treating the safe zone as an inscribed square (would allow a 290px
bbox — nearly the same answer, but by luck rather than by the spec platforms publish); ignoring the
safe zone and relying on most launchers using a rounded-square mask (rejected: the circle mask is
the one platforms actually apply, and it is the reason `purpose: maskable` exists).

**Spec corrections applied**: the measurement table, the "only the two 512s are degraded" claim, the
Assumptions bullet, and FR-842's justification.

---

## R2 — One alpha matte, derived by unmixing, is the whole pipeline

**Decision**: Extract a single **alpha matte** from the board once, by algebraic unmixing, then
produce every asset by painting that matte onto a plate or onto transparency.

**The problem**: the board has **no alpha channel** (verified: three channels). The coral mark
exists only as coral pixels composited against the board's navy, so a naive crop carries that navy
into every antialiased edge — which is why the spec forbade an in-app mark produced the same way as
an install icon (FR-820a).

**The solution**: for a two-colour image, every pixel is `P = α·F + (1−α)·B`, so `α = (P−B)/(F−B)`.
Solved on the **red channel**, where the delta between coral `#fe6551` and navy `#0d1942` is **241
of 255** — the largest of the three, so the division is numerically stable.

**Measured on the real crop (283×300 = 84,900 pixels)**:

| Result | Value |
|---|---|
| Fully transparent (α ≤ 0.05) | 60.2% |
| Fully opaque (α ≥ 0.95) | 37.8% |
| Intermediate (genuine antialiased edge) | **~1.2%** |
| Out of `[0,1]` before clamping | 1.49% |
| Worst per-channel residual on edge pixels | 25/255 |

98% of the crop resolves to fully opaque or fully transparent, which is exactly the signature of a
clean vector-drawn shape. The 1.49% out-of-range and the residual are the board's subtle paper
texture; clamping absorbs both, and the rendered result is visibly clean with **no halo**.

**Why this matters beyond convenience**: one matte yields the coral in-app mark, the navy in-app
mark, the icon on its plate and every favicon. The colourway requirement FR-820b asks for stops
being two crops to keep in sync and becomes one matte painted twice.

**It also softens FR-809's stated reasoning, and that is recorded rather than hidden.** FR-809 and
the new constitution block argue the plate MUST be brand navy *because* the edges are blends against
it. With a correctly unmixed matte the halo does not arise at any plate colour, so the mechanical
necessity is weaker than written. **The decision is unchanged** — owner decision B3 puts the brand's
colours on the icon on brand grounds, which never depended on the mechanics — but the next person to
read that clause should know the argument is "brand identity, and it also avoids a halo if you crop
naively", not "physics forbids anything else".

**Alternatives considered**: cropping the navy-on-cream quadrant instead (rejected: the cream
background measures `#fcf8f5`–`#fdf9f6` across the quadrant, so it is *not* uniform, and unmixing
against a moving background produces a noisy matte — the navy quadrant sampled identically at every
point tested); manual keying in an image editor (rejected outright: not reproducible, not readable,
and it is the "opaque binary" the convention exists to prevent).

---

## R3 — The board's scale tests are a reference, not a pixel source

**Decision**: Produce the favicons by **downscaling the 300px master**. Do not crop the board's
32/24/16 scale tests.

The temptation is real: the board carries purpose-drawn scale tests, so cropping them looks like
using the designer's own answer for small sizes. Measured, the glyphs in that strip are **55, 39 and
23 pixels tall** — rendered at presentation size in a contact sheet, and *labelled* 32/24/16 rather
than drawn at those pixel dimensions. Cropping the "16×16" test yields a 22×23px already-antialiased
fragment that must then be scaled **down by 0.7×** — a worse source than the 300px master, not a
better one.

**What they are for**: confirming the mark's shape survives at small size, which they do. That is
the reference FR-818a points a human reviewer at.

**Alternatives considered**: using the monochrome scale test as the source for a monochrome icon
variant — moot, since the monochrome variant is out of scope (FR-841), and the matte from R2 paints
any colour anyway.

---

## R4 — 16px legibility is real but tight, and the fill fraction is the lever

**Finding**: rendered at 16px from the master, the mark is **recognisable as an "N" but soft** — the
node terminals merge into the strokes. At 32px it is clean.

This is not a defect to fix in research; it is the judgement FR-818a assigns to a human. What
research contributes is **the lever**: the mark's fill fraction within the favicon square. The trial
used 0.78 with padding on all sides; a favicon has no safe-zone constraint and no launcher mask, so
it can go considerably tighter, and tighter is sharper because more pixels carry the shape.

**Recommendation to implementation**: tune the small sizes by eye against the board's own scale
tests, and treat 32px as the size that must be right — most browsers request 32 on the hidpi
displays this product's attendees are using.

---

## R5 — The existence gate is a unit test, not a build plugin, and that resolves a circularity

**Decision**: Extract the icon declarations into a data module shared by the Vite config and a unit
test under `apps/web/tests/unit/`.

**Why a shared module**: the manifest currently lives inline in `apps/web/vite.config.ts`. A test
cannot read a declaration it cannot import, and importing the whole Vite config drags in every
plugin. The repository already has the pattern — `vite.config.ts` imports `PRODUCT_NAME` from
`src/app/branding.ts`, so the config reading a data module out of `src` is established rather than
novel. The declarations are pure data; `readColourToken` stays in the config, because it does file
I/O the browser program must never see.

**Why a unit test rather than a build-time plugin**, which is what "fails the build" (FR-832) might
suggest: FR-835 requires it to run in the existing correctness gates, and there it does — but making
`vite build` itself abort creates a **circular dependency for screenshots**. Screenshots are
captured *from the built application* (R6). If declaring them made the build fail until they exist,
and capturing them requires the build, neither can ever happen first. As a unit test, `pnpm build`
succeeds and `pnpm verify` fails, which is the honest sequencing.

**Reading PNG dimensions needs no dependency.** A PNG's IHDR puts width at byte offset 16 and height
at 20, big-endian, immediately after the 8-byte signature. Sixteen lines, no `sharp` in the web test
environment.

**Confirmed**: the `unit` project runs in the **node** environment and already includes
`apps/web/tests/unit/**/*.test.ts` — `service-worker.test.ts` reads source files with `node:fs`
today, so this is the established shape for a source-level guard here.

**The test's inputs are two**: the shared declarations module, and `apps/web/index.html` parsed for
its `<link rel="icon">` and `<link rel="apple-touch-icon">` hrefs. Both resolve against
`apps/web/public`.

---

## R6 — Screenshots are the expensive half, and they must be sequenced last

**Decision**: capture with Playwright against the seeded end-to-end stack, into
`apps/web/public/screenshots/`, excluded from precache via `injectManifest.globIgnores`.

**Why Playwright rather than hand-captured**: FR-815c requires them regenerable. The end-to-end
stack already provides everything needed — `playwright.config.ts` builds and serves a production
client, `global-setup.ts` seeds the database, and `e2e/support/attendees.ts` supplies signed-in
fixtures. Nothing new is stood up; a capture script reuses what the suite already has.

**FR-815e falls out for free.** The data on screen is seeded fixture data by construction, because
that is the only data the end-to-end stack contains. The repository is public, so this is the
difference between a committed screenshot being a product illustration and being somebody's records.

**Precache exclusion is one line**: `injectManifest.globIgnores` already carries `['**/*.map']`;
`'screenshots/**'` joins it. Verified that `globPatterns` is what feeds `precacheAndRoute` in
`src/sw.ts` via `__WB_MANIFEST`.

**Sequencing consequence**: capture must run **before** the declarations are added, or the gate from
R5 fails on files that do not exist yet. Because the gate is a test rather than a build plugin, this
is an ordering preference rather than a deadlock — but the tasks should still read capture → declare.

---

## R7 — `sharp` must become a root devDependency, explicitly

**Decision**: add `sharp` to the **root** `devDependencies` and keep the generator at
`scripts/generate-brand-assets.mjs`.

**Why it is not already available**: `sharp` is a dependency of `apps/api` only, and `.npmrc` sets
`shamefully-hoist=false` — deliberately, so that "every dependency justified" is enforceable rather
than aspirational. Verified: a root script importing `sharp` fails with `ERR_MODULE_NOT_FOUND`.
Reaching into `node_modules/.pnpm/...` works and is exactly the phantom dependency that setting
exists to forbid.

**Why the root rather than `apps/web`**: the outgoing `scripts/generate-provisional-icons.mjs` sets
the location convention, the script writes into `apps/web/public/` from outside it, and `scripts/`
is already a first-class place with its own test glob (`scripts/**/*.test.mjs` runs in the unit
project). Adding it to `apps/web` would put an image-processing native binary in the package that
builds the client bundle.

**Alternatives considered**: hand-rolling PNG encoding with no dependency, as the provisional
generator does (rejected: the provisional generator draws rectangles and a diagonal band, which is
forty lines of `zlib`; this pipeline resamples with a Lanczos filter and composites alpha, which is
not); moving the script under `apps/api` to reuse its dependency (rejected: a web asset pipeline in
the API package is a worse lie than an extra devDependency).

---

## R8 — The brand constants need no lint exemption

**Finding**: `mynet/no-colour-literals` is registered on **`apps/web/**/*.{ts,tsx}`** and on the CSS
language block. It does **not** cover `scripts/`.

Verified against the outgoing generator, which declares `const NAVY = [0x1b, 0x23, 0x40]` and passes
lint today. So the brand constants living in `scripts/generate-brand-assets.mjs` require no
exemption, no allow-list entry, and no rule change.

**This makes SC-811 literally true rather than approximately true**: the count of colour literals
outside the token file does not rise, because the file they live in was never counted. The
obligation FR-809 creates is therefore **documentary** — the reasoning must be written where the
constants are defined — rather than a lint concession. That is a meaningfully weaker claim than the
spec implies, and it is better for it: nothing is being carved out.

**Consequence for the in-app mark**: the mark is a static asset referenced by path, so no component
names a colour. Nothing in `apps/web/src` gains a literal.

---

## R9 — Favicon set contents, closing Open Question 2

**Decision**: ship PNG favicons at **16, 32 and 180 (apple-touch)**, plus a **`favicon.ico`
containing the 16 and 32 as embedded PNG payloads**, at the site root.

**On the `.ico`**: the spec left this open. With `<link>` tags present, every current browser uses
them and never requests `/favicon.ico`. The remaining requesters are clients that guess the
conventional path without parsing the document — feed readers, link unfurlers, some crawlers, and
anything fetching the origin root. The cost is ~2KB and roughly thirty lines: the ICO container is a
6-byte header, one 16-byte directory entry per image, and the PNG bytes verbatim — ICO has permitted
embedded PNG since Vista, so nothing needs re-encoding.

**Rationale for including it**: SC-804 asks that *zero* surfaces show the browser's default glyph,
and a client that never reads the document is a surface. A permanent 404 on the origin root is also
a small, forever line in the access log of a product that is about to acquire its first real
deployment.

**Alternatives considered**: PNG links only (simpler, and defensible — the .ico is genuinely low
value); a full multi-resolution `.ico` with 48 and 64 as well (rejected: those sizes are Windows
desktop-shortcut territory, which is not a surface this product has).

---

## R10 — Where the in-app mark lives, and how the width bands select it

**Decision**: one shared presentational component, consumed by all seven surfaces; band selection in
**CSS**, not JavaScript.

**Band selection** is settled by existing practice rather than by preference. `DesktopRail` is
`hidden … desktop:flex` and `TopBar` renders both its labels with `tablet:hidden` / `hidden
tablet:inline` — a CSS-only choice, because `display: none` removes the other form from the
accessibility tree and the tab order as well as from the page, and because reading the viewport in
feature code is a direct platform access that `mynet/no-direct-platform-access` forbids (FR-045).
FR-827 requires exactly this, and the mark follows the pattern that is already there.

**The 320px constraint is the real design work.** `TopBar`'s own source comment records the rule:
at 320px the label, the conference switcher, the profile control and the sign-out control share one
row, and *"something has to give, and it must be a label rather than a control"*. The mark must
therefore be `shrink-0` at a fixed small size while the product-name label keeps `shrink truncate`,
so the label yields first and no control moves (FR-825). This is asserted by the existing
`horizontalOverflow` helper in `e2e/responsive.spec.ts`, which already measures document overflow at
every width from 320px and reports the widest offending element.

**Asset shape**: a raster mark sized generously (≈96px tall) and rendered small by CSS, so it is
crisp on hidpi without shipping three variants. At 96px it is a downscale from the 300px master and
pixel-exact. Two files, one per colourway, from the same matte.

---

## R11 — Verifying colourway, the defect no behavioural test sees

**Decision**: assert **which asset each surface references**, not what it looks like.

FR-820b's failure mode is a mark that is present, correctly sized, correctly hidden from assistive
technology, and invisible because it matches its background. No behavioural assertion distinguishes
that from success, and a screenshot comparison would be a new gate class this project does not have.

What *is* assertable, cheaply and at component level: the light-surface surfaces reference the navy
asset and the inverse surface references the coral one. It is a weaker guarantee than "the mark is
visible" and it is honest about being weaker — it catches the swap, which is the mistake that
actually happens, and it catches a later edit that changes one and not the other.

Paired with it: **exactly one mark visible per width band** (FR-824), which *is* directly assertable
in the existing responsive end-to-end spec by counting rendered marks at each width.

---

## Open questions carried into implementation

None blocking. Two items are deliberately left to human judgement rather than resolved here:

- **The small-size fill fraction** (R4) — tune by eye against the board's scale tests.
- **Mark size and position on each surface** — register entry 4 territory. No gate this project has
  can judge it, which is the whole reason the entry is escalated rather than closed.
