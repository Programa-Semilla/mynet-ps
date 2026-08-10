# Brainstorm: Brand mark and application icons

**Date:** 2026-08-10
**Status:** resolved — specified as
[010](../specs/010-brand-mark-and-app-icons/spec.md), ratified as constitution v3.3.0

> **This is a dated session record and its body is preserved as written.** Two things it describes
> have since changed and are recorded here rather than edited into the text above, so that the
> reasoning still reads as it was reasoned: the brand board is now tracked at
> **`assets/brand/logo.png`** (the session argued for the move; 010 carried it out), and the
> "1.37× upscale" this session assumed was **wrong** — the maskable safe zone is a *circle* of 80%
> diameter, so nothing 010 ships is upscaled at all. See
> [research R1](../specs/010-brand-mark-and-app-icons/research.md).

## Problem Framing

The project owner supplied a brand board at `seeds/logo.png` — a 1254×1254 contact sheet carrying
the MyNet mark (a continuous round-capped "N" with two node terminals) on navy and on cream, a
horizontal and a stacked lockup with the wordmark, scale tests at 32/24/16px, and a monochrome
test.

**This closes a standing gap the codebase has been explicitly holding open.** CLAUDE.md's open
questions list *"Real brand mark and application icons. None exist here"*; the delivery roadmap
marks it **Now / feature 010 / Client**; and it sits in the constitution's register. The owner
supplying the mark **is** that client decision.

The repository anticipated this and left a written procedure. `apps/web/public/icons/README.md` is
titled *"PROVISIONAL, NOT BRANDING"* and carries a four-step replacement checklist.
`scripts/generate-provisional-icons.mjs` renders a navy square with a coral disc **struck through
by an amber diagonal band**, and says why: *"a tasteful placeholder is the dangerous kind: it looks
finished, so it ships."* Replacing these is the whole point of that band existing.

### What the surfaces look like today

| Surface | State before this work |
| --- | --- |
| PWA manifest icons | Three provisional PNGs: 192, 512, maskable-512 |
| `apps/web/index.html` | **No favicon link and no `apple-touch-icon` at all** |
| Desktop rail, mobile top bar | The bare text `"MyNet"` from `PRODUCT_NAME` |
| Five auth screens | `<h1>MyNet</h1>` plus the tagline — no mark |
| `theme_color` / `background_color` | navy-800 / cream-100, read from `tokens.css` at build time |

### Two measurements that shaped the decisions

**The mark's real resolution.** Sampled from the board, the mark occupies **283×300px** inside its
627px quadrant. Filling a 512 icon at the 80% maskable safe zone is therefore a **1.37× upscale** —
mildly soft on a low-frequency shape with no fine detail, not mushy. Every asset at or below 300px
(192, apple-touch 180, all favicons) is a *downscale* and will be pixel-exact. Only the two 512s
are compromised.

**The brand palette does not match the design tokens.**

| | Brand board | Current token | Match |
| --- | --- | --- | --- |
| Navy | `#0d1942` | `navy-800 #1b2340` | **No** — brand navy is deeper and bluer |
| Coral | `#fe6551` | `coral-500 #e8634d` | **No** — brand coral is hotter and brighter |
| Cream | `#fdf9f6` | `cream-100 #fdf8f3` | Yes, effectively identical |

This has teeth because `theme_color` and `background_color` are read out of `tokens.css` at build
time by `readColourToken` (FR-008 — every colour defined in one place, with no manifest exemption).
An icon carrying the board's navy against a splash screen painting the token navy shows a seam on
the one surface where the icon is most prominent.

## Approaches Considered

### A: One feature (010), generated pipeline, full spex cycle — **CHOSEN**

- Pros: matches how 008 handled a register-closing change (spec, amendment and implementation
  together); keeps the desktop/tablet layout review whole rather than split across PRs; the icon
  README's own replacement procedure is followed in one pass; closes the last release blocker that
  does not require the owner to buy a domain or name an Azure subscription.
- Cons: heaviest path for what is, in file terms, a handful of PNGs and some markup.

### B: Two phases, PWA blocker first

- Pros: ships the release-blocking half (icons, favicon, manifest) as a small, tightly reviewable
  PR; separates asset plumbing from visual review.
- Cons: two gate runs; and the desktop and tablet layout review — already an open question this
  project keeps deferring — splits across two PRs, which is exactly how it keeps getting deferred.

### C: Chore PR, no spec

- Pros: fastest path to pixels.
- Cons: it is not a chore. It closes a register entry, changes what the installed product is called
  and looks like, and touches the shell on every layout band. Principle IX requires a feature to
  declare its own completeness — offline behaviour, all three layouts, accessibility, identity and
  event scoping — and a chore PR declares none of it.

## Decision

**Approach A, with a constitution amendment.**

Delivered as **feature 010**, carrying a standing decision and a constitution amendment that closes
the register entry *"Real brand mark and application icons"*.

Four decisions were settled during the session:

1. **Raster now, vector later.** The board is the only source; the mark is cropped from it rather
   than redrawn. An SVG redraw is recorded as a follow-up **before release**, because only the two
   512px assets are actually degraded and everything else is a downscale.
2. **The icon carries the brand's colours** (`#0d1942` plate, `#fe6551` mark). Whether the *UI*
   palette adopts them is **deferred** and becomes an open question — see below. The interim cost
   is a subtle seam between the icon plate and the token-derived `theme_color`, knowingly accepted.
3. **All four surface bundles are in scope**: PWA install assets, browser chrome and favicons,
   the in-app mark, and the install-UI extras.
4. **The mark ships as an image beside live text**, never as a raster lockup. `"MyNet"` stays real
   text in `font-display` (Outfit), which matches the board wordmark's genre closely.

## Key Requirements

### Source of truth and asset production

- `seeds/logo.png` is committed as the tracked brand source. It is currently **untracked**
  (`?? seeds/`).
- **Assets are derived by a readable script, not committed as opaque binaries.** This preserves the
  convention `generate-provisional-icons.mjs` established: a reviewer verifies the crop rectangles,
  the maskable safe-zone inset and the plate colour by reading code, not by opening a PNG and
  trusting it. `sharp` is already an `apps/api` dependency.
- The later SVG redraw then becomes **a change of input to the same pipeline**, not a second
  mechanism.

### PWA install assets

- Replace `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` at their existing names and sizes.
- Add `apple-touch-icon` at 180×180 with an **opaque plate**: iOS ignores `purpose: maskable`
  entirely and renders transparency as black.
- The maskable variant keeps the mark inside the 80% safe zone platforms may crop to.

### Browser chrome

- Add a favicon set and the `<link>` tags to `index.html`, which today has **neither**. Every tab
  currently shows the browser's default document glyph.
- The board's own 32/24/16px scale tests confirm the mark holds at tab size.

### In-app mark

- Desktop rail, mobile top bar, and the five auth screens (`SignInScreen`, `SignUp`, `Verify`,
  `ResetRequest`, `ResetPassword`).
- **Existing accessibility semantics are preserved, not replaced.** The rail's `<span>` and the auth
  screens' `<h1>` keep their text; the mark sits beside them and is `aria-hidden`. Nothing that a
  screen reader reads today stops being read.

### Install-UI extras

- Manifest `screenshots`, iOS `apple-touch-startup-image` splash screens, and a
  `purpose: "monochrome"` icon variant — the board's monochrome test suggests the mark was drawn
  with this in mind.
- **The splash images must be excluded from the precache glob.** `injectManifest` globs
  `**/*.{js,css,html,ico,png,svg,webmanifest}`, so every PNG under `public/` is precached at
  install. A full device-specific iOS splash set is 10–20 images and can run to several megabytes,
  silently added to the install download — on a phone at a venue, which is the product's stated
  operating condition.

### Housekeeping the icons README asks for

Following `apps/web/public/icons/README.md` § "Replacing them":

1. Replace the three files at the same names and sizes.
2. Delete `scripts/generate-provisional-icons.mjs`.
3. Rewrite the README to record the source of the real assets.
4. Re-check `background_color` and `theme_color` still suit the mark.

### A gate that does not exist yet

**Nothing asserts that the icons the manifest declares actually exist on disk.** The manifest could
name a missing file and every gate would pass — typecheck, lint, unit, component, contract,
integration, a11y, e2e and the production build all stay green, and the failure appears only when a
real device tries to install. This feature should add a test deriving its expectations from the
manifest declaration, in the spirit of `deletion-coverage` and `export-coverage`: **a newly declared
icon with no file fails by existing.**

## Open Questions

- **Whether `navy-800` and `coral-500` adopt the brand values** (`#0d1942`, `#fe6551`). Deliberately
  deferred. Adopting them makes the board the single source of truth and removes the seam, but
  navy-800 is the primary surface and coral-500 the accent, so it repaints the entire product and
  the accessibility e2e suite must re-pass on the new contrast ratios. Until it is settled, the icon
  plate and the token-derived `theme_color` differ visibly on the splash screen.
- **`seeds/` is the wrong home for brand source, and it collides.** In this repository "seed" means
  database seed data (`pnpm db:seed`, `apps/api/src/db/seed`). A brand board living in `seeds/` reads
  as conference fixture data. A dedicated `brand/` directory is probably right; the spec should
  settle it before the path is referenced from a build script.
- **Whether the mobile top bar should carry the mark at all.** It is contextual by design — at
  mobile widths it carries the product name, at larger widths the current destination. Adding a
  mark risks the mark competing with the destination name for the same small strip.
- **Which arrangement on the auth screens** — mark above the wordmark, or beside it. The board
  supplies both lockups; the choice is per-surface and belongs in the spec.
- **The iOS splash device matrix** — how many sizes, and which. This is the bulk of the extras
  bundle's cost and the whole of its precache risk.
- **Whether `purpose: "monochrome"` is worth shipping.** Platform support is thin and the value is
  narrow; the board's monochrome test is suggestive but not decisive.
- **Whether the asset budget (FR-072) counts `public/` assets.** The budget reads the entry chunk
  and its static imports, so these probably fall outside it — which means the extras bundle could
  add megabytes to the install with **no gate objecting**. Worth confirming rather than assuming.
- **Desktop and tablet layouts remain unvalidated**, and this feature adds a visual element to both.
  CLAUDE.md records that the first human to look at a dialog found it rendering in the top-left
  corner, having passed 135 e2e tests, five review agents and CodeRabbit. A brand mark's position
  and size is exactly the class of thing no behavioural gate can see.
- **The SVG redraw follow-up** must be booked, not merely noted, or the 1.37×-upscaled 512s become
  permanent by default.
