# Feature Specification: Brand Mark and Application Icons

**Feature Branch**: `docs/brand-mark-and-app-icons` (spec) → `feat/010-brand-mark-and-app-icons`
(implementation)

**Created**: 2026-08-10

**Status**: **Implemented 2026-08-10** on constitution amendment **v3.4.0** (ratified the same day,
satisfying FR-849's precondition that ratification precede implementation). Every automated gate is
green. **The by-hand validation is outstanding** — quickstart scenarios 5–9 need a device and a
person, and exactly what was and was not walked is recorded in
[delivery-record.md](./delivery-record.md).

**Input**: Brainstorm #08 (`brainstorm/08-brand-mark-and-app-icons.md`), which recorded the owner
supplying a brand board and chose Approach A — one feature, a generated pipeline, the full spex
cycle. Delivery roadmap phase **010 — Launch Readiness**, **no migration**. Four design questions
the brainstorm left open were answered by the owner on 2026-08-10 and are marked **OWNER DECISION**
below.

## Context and Scope Note

This feature gives MyNet a face. It is the first change in the project whose deliverable is
primarily *seen* rather than *behaved*, and that is the whole of its risk.

### What the register entry was, and what answered it

Constitution register **entry 2** reads: *"Real brand mark and application icons. No logo exists in
the repository; the only images are avatar photographs used as prototype sample data. Long lead
time — it blocks release readiness, not any single feature."* It has stood since 1.0.0.

On **2026-08-10 the project owner supplied a brand board**, and that supply **is** the client
decision the entry was waiting for. Nothing here invents a mark; the mark already exists and this
feature carries it into the product.

### What the mark is, measured rather than described

The board is a 1254×1254 contact sheet. Every figure below was **sampled from the file**, not taken
from the brainstorm, and all four agree with it:

| Property | Measured value |
|---|---|
| Board dimensions | 1254×1254, three channels, **no alpha** |
| Mark | A continuous round-capped "N" with two node terminals — a letterform drawn as a network path |
| Coral mark on navy, bounding box | **283×300** at (172,162)–(454,461) |
| Navy mark on cream, bounding box | 285×300 at (785,162)–(1069,461) |
| Brand navy | **`#0d1942`** |
| Brand coral | **`#fe6551`** |
| Brand cream | `#fcf8f5`–`#fdf9f6` |
| Also on the board | Horizontal and stacked lockups in both colourways; scale tests at 32/24/16px in coral, navy and black; a monochrome test |

**The mark's real resolution is 300px tall, and nothing in this feature upscales it.**

> **Corrected at planning (research R1).** The brainstorm and this spec's first draft both stated
> that filling a 512 icon at the 80% maskable safe zone is a **1.37× upscale**, and concluded that
> the two 512px assets are degraded. **That was wrong, and following it would have shipped a
> clipped icon.** The maskable safe zone is a **circle** whose diameter is 80% of the icon's
> smallest dimension — not 80% of the side available to a bounding box. A mark whose *bounding box*
> spans 80% of a 512px square puts its corners **281px** from the centre against a safe radius of
> **204.8px**, so an Android circular mask cuts the node terminals off. The largest bounding box
> that actually fits the safe circle renders the mark **297.9px** tall: a **0.993× scale of
> native**. Verified by rendering both and applying the mask.

Every asset in this feature is therefore at or below the mark's native 300px — the maskable 512, the
standard 512, the 192, the 180 apple-touch, every favicon and every in-app rendering — so all of
them are pixel-exact. **Nothing is degraded.** A vector redraw stays booked (FR-842) for resolution
independence at sizes not yet asked for, which is a weaker and more honest reason than the one first
given.

### The board's own geometry constrains the plate colour

This is not an aesthetic preference and it is easy to get backwards. The board has **no alpha
channel**, so the coral mark exists only as coral pixels *composited against the board's navy*, with
antialiased edges that are blends of `#fe6551` and `#0d1942`. Painting that crop onto a plate of any
other navy — including the design token's `navy-800 #1b2340` — leaves a visible halo of the board's
navy around every curve, at exactly the sizes where the mark is largest.

**So the icon plate must be the brand's `#0d1942`.** The choice was already made on brand grounds
(brainstorm decision 2); the crop geometry makes it the only correct choice as well.

### The palette disagreement, and the seam it leaves

| | Brand board | Design token | Match |
|---|---|---|---|
| Navy | `#0d1942` | `navy-800 #1b2340` | **No** — brand navy is deeper and bluer |
| Coral | `#fe6551` | `coral-500 #e8634d` | **No** — brand coral is hotter and brighter |
| Cream | `#fcf8f5` | `cream-100 #fdf8f3` | Yes, effectively identical |

This has teeth because `theme_color` and `background_color` are **read out of `tokens.css` at build
time** by `readColourToken` in `apps/web/vite.config.ts` — FR-008 says every colour is defined in one
place, and the manifest gets no exemption. So an icon carrying `#0d1942` sits on a splash screen
painted `#1b2340`: a subtle seam on the one surface where the icon is most prominent.

**Whether the UI palette adopts the brand values is deliberately NOT decided here** (see Open
Questions). The seam is a **knowingly accepted interim cost**, recorded so that it is a decision
rather than a defect somebody rediscovers.

### What the surfaces look like today — with one correction to the brainstorm

| Surface | State before this work |
|---|---|
| PWA manifest icons | Three provisional PNGs: 192, 512, maskable-512 |
| `apps/web/index.html` | **No favicon link and no `apple-touch-icon` at all** — every tab shows the browser's default document glyph |
| Desktop rail | The bare text `MyNet` from `PRODUCT_NAME`, desktop band only (`≥1280px`) |
| Mobile top bar | The bare text `MyNet`, **already truncated to "M…" at every mobile width** before this feature (it needs 60px and has 43–58px); at tablet and above the same slot carries the **current destination** instead |
| Tablet band | **No brand presence anywhere** — `DesktopRail` is `≥1280px` only and the bar has switched to the destination name. Note that a rail *is* present here (`TabletRail`, 768–1279px); it carries navigation and no brand |
| `theme_color` / `background_color` | `navy-800` / `cream-100`, read from `tokens.css` at build time |

**Correction.** Brainstorm #08 states that all five auth screens carry `<h1>MyNet</h1>` plus the
tagline. Read against the source, only **one** does:

| Screen | Heading today |
|---|---|
| `SignInScreen` | `<h1>MyNet</h1>` + tagline |
| `SignUp` | `<h1>Create your MyNet account</h1>` + tagline |
| `Verify` | `<h1>Verify your email address</h1>` — **no product name** |
| `ResetRequest` | `<h1>Reset your password</h1>` — **no product name** |
| `ResetPassword` | `<h1>Set a new password</h1>` — **no product name** |

This matters to the requirement's wording: on three of the five screens the mark is not joining a
wordmark, it is **introducing brand presence where there is none**. The accessibility rule is
unchanged either way — headings keep their text, the mark is decorative — but "beside the wordmark"
would have been an instruction that could not be followed on three screens.

### The provisional icons, and why they look like that

`apps/web/public/icons/README.md` is titled **"PROVISIONAL, NOT BRANDING"** and
`scripts/generate-provisional-icons.mjs` renders a navy square with a coral disc **struck through by
an amber diagonal band**. The README says why: *"A tasteful placeholder is the dangerous kind: it
looks finished, so it ships and nobody notices for a year. This one cannot be mistaken for a
decision."*

Removing that band is the point of this feature. The README also carries a four-step replacement
checklist, written for exactly this moment, and this feature follows it.

### Departure from the delivery roadmap

The roadmap's **010 — Launch Readiness** is a broader phase: the full `requirements.md` validation
checklist, an accessibility sweep across all five destinations, a core-journey end-to-end test at
three widths, PWA caching against real data volumes, a physical iPhone test, a performance pass —
and, listed separately as a **long-lead gate to be raised early rather than met here**, the brand
mark and application icons.

**This feature takes the brand-mark gate and nothing else.** It occupies number 010 because the
roadmap and the brainstorm overview both already name it that; the remaining Launch Readiness items
are not delivered here and remain outstanding. The roadmap is a plan rather than governance, and
this paragraph is the declaration that constitution Principle IX requires of a feature departing
from it.

### Scope decision: core only

**OWNER DECISION (2026-08-10) — "core only".** In scope: the PWA install icons, the apple-touch
icon, the favicon set, the in-app mark, and **manifest screenshots**. The remaining install-UI extras
the brainstorm floated are **out of scope** and are booked as named follow-ups rather than noted in
passing:

1. **The iOS `apple-touch-startup-image` splash device matrix.** A full set is 10–20 images running
   to several megabytes, and `injectManifest` globs `**/*.{js,css,html,ico,png,svg,webmanifest}` —
   so *every* PNG under `public/` is precached at install. That download lands on a phone at a
   venue, which is the product's stated operating condition. When this is picked up it must carry
   the precache exclusion with it.
2. **The `purpose: "monochrome"` icon variant.** The board's monochrome test is suggestive; platform
   support is thin and the value is narrow.
3. **The SVG redraw.** Must be **booked**, not merely noted. It is a change of *input* to the same
   pipeline, not a second mechanism. Its reason changed at planning: research R1 found that nothing
   this feature ships is upscaled, so the redraw buys resolution independence for sizes not yet
   asked for rather than rescuing a degraded asset.

### What this feature does not do

- **It does not repaint the product.** No design token changes value. See Open Questions.
- **It does not touch the database.** No table, no column, no migration, no seed data.
- **It does not collect, store or transmit any attendee data.** Every asset is static and identical
  for every attendee.
- **It does not change any accessible name, heading, or landmark.** Nothing a screen reader reads
  today stops being read.
- **It does not add a raster lockup.** `MyNet` stays live text, always.
- **It does not add a route, a destination, a Home card, or a repository.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install MyNet and recognise it on the home screen (Priority: P1)

An attendee installs MyNet to their phone's home screen before travelling to a conference. The icon
that appears among their other applications is the MyNet mark on the brand plate — not a struck-out
placeholder — and it is cropped correctly by whatever mask their platform applies. On iOS the icon
is opaque; nothing renders as a black square.

**Why this priority**: This is the release blocker. FR-050 has been satisfied by a placeholder that
exists specifically to be impossible to ship, and the amber band is a standing instruction that this
must be done before release.

**Independent Test**: Install the built application on a device (or through a browser's install
flow) and look at the resulting home-screen icon at its rendered size and under a circular mask.

**Acceptance Scenarios**:

1. **Given** the application is built, **When** an attendee installs it, **Then** the home-screen
   icon shows the MyNet mark on the brand navy plate with no diagonal band.
2. **Given** a platform that applies a circular or squircle mask, **When** it crops the maskable
   icon, **Then** no part of the mark is cut off.
3. **Given** an iOS device, **When** the application is added to the home screen, **Then** the icon
   plate is opaque and no transparency is rendered as black.
4. **Given** the application is launched from the home screen, **When** the splash screen shows,
   **Then** the icon and the splash background are both drawn from declared values — with the known
   navy seam described in Assumptions, and no other discrepancy.
5. **Given** a platform that shows a rich install prompt, **When** an attendee is offered the
   install, **Then** the prompt shows screenshots of real MyNet surfaces, and none of them contains
   data belonging to a real account.
6. **Given** the application is installed, **When** the install download completes, **Then** the
   screenshots are **not** part of what was downloaded.

---

### User Story 2 - Find the MyNet tab among twenty others (Priority: P1)

An attendee has MyNet open in a browser tab alongside their email, the conference website and a
dozen other things. The tab carries the MyNet mark rather than the browser's blank-document glyph,
and the mark is still identifiable at 16px. A bookmark or a pinned tab shows the same.

**Why this priority**: `index.html` has **never** had a favicon link. This is not a downgrade from
something adequate; there is nothing there at all, and a conference workspace that an attendee keeps
open all day is precisely the product that must be findable in a crowded tab strip.

**Independent Test**: Load the application in a browser and inspect the tab, a bookmark, and a
pinned tab. Compare against the board's own 16px scale test.

**Acceptance Scenarios**:

1. **Given** the application is served, **When** an attendee opens it in a browser, **Then** the tab
   shows the MyNet mark and not the default document glyph.
2. **Given** a browser rendering the favicon at 16px, **When** an attendee scans the tab strip,
   **Then** the mark is distinguishable as the MyNet "N" and not an indistinct blob.
3. **Given** an attendee bookmarks or pins the tab, **When** they view the bookmark bar, **Then**
   the same mark appears.

---

### User Story 3 - Recognise the product from inside it, at every width (Priority: P2)

An attendee signing in, or moving between destinations, sees the MyNet mark in the shell. On a phone
it sits in the compact header beside the product name; on a tablet it sits in the same header beside
the destination name; on a desktop it sits in the persistent rail above the navigation. On every
authentication screen it sits centred above the heading. Nothing that a screen reader reads today
stops being read, and nothing needs horizontal scrolling to reach.

**Why this priority**: It is what makes the product feel like a product rather than a shell with a
correct icon file. It is P2 rather than P1 because it blocks nobody's install and nobody's tab.

**Independent Test**: Sign in and visit each destination at 320px, tablet and desktop widths, then
visit each of the five authentication screens; confirm the mark is present, positioned as declared,
and that no destination overflows horizontally.

**Acceptance Scenarios**:

1. **Given** a viewport of 320px, **When** an attendee views any destination, **Then** the mark, the
   product name, the conference switcher, the profile control and the sign-out control all fit
   without horizontal scrolling, and **no control is displaced by the mark**.
2. **Given** a tablet-width viewport, **When** an attendee views any destination, **Then** the mark
   is present in the top bar beside the destination name.
3. **Given** a desktop-width viewport, **When** an attendee views any destination, **Then** the mark
   appears **once**, in the rail — not simultaneously in the rail and the top bar.
4. **Given** a screen-reader user, **When** they traverse the shell, **Then** the mark is not
   announced, and the product name and destination name are announced exactly as they are today.
5. **Given** any of the five authentication screens, **When** it renders, **Then** the mark is
   centred above the existing heading and the heading text is unchanged.

---

### User Story 4 - A reviewer verifies the assets without opening a binary (Priority: P2)

Someone reviewing the change reads the generation script and can see which rectangle of the board
each asset is cropped from, what plate colour is painted behind it, and what inset the maskable
variant uses. They do not have to open a PNG in an image editor and trust that it is what the
description claims.

**Why this priority**: It preserves the convention `generate-provisional-icons.mjs` established, and
it is what makes the later SVG redraw a change of input rather than a second, divergent mechanism.
Committing eight opaque binaries would end that convention silently.

**Independent Test**: Read the generation script; re-run it on a clean checkout and confirm the
regenerated assets are byte-identical to the committed ones.

**Acceptance Scenarios**:

1. **Given** the brand source and the generation script, **When** the script is run, **Then** it
   produces the complete asset set deterministically.
2. **Given** a reviewer reading only the script, **When** they inspect it, **Then** the crop
   rectangles, plate colour and safe-zone inset are stated in it as readable values.
3. **Given** the brand source is missing or has different dimensions than the script expects,
   **When** the script runs, **Then** it fails loudly and names what it expected, rather than
   emitting a plausible-looking wrong asset.

---

### User Story 5 - A declared icon that does not exist fails the build (Priority: P2)

A future change adds an icon declaration to the manifest — a new size, a new purpose — and forgets
the file, or renames a file and forgets the declaration. The build fails, immediately, naming the
declaration and the missing path.

**Why this priority**: **Nothing asserts this today.** The manifest could name a file that does not
exist and all ten correctness gates would stay green — typecheck, lint, unit, component, contract,
migration, integration, accessibility, e2e and the production build — with the failure appearing
only when a real device tries to install. This is the same class of hole
`tests/unit/deletion-coverage.test.ts` and `export-coverage.test.ts` close for attendee data: **a
new declaration fails by existing.**

**Independent Test**: Add an icon declaration naming a path that does not exist; confirm the build
fails. Remove a declared file; confirm the build fails.

**Acceptance Scenarios**:

1. **Given** the manifest declares an icon, **When** the corresponding file is absent, **Then** the
   build fails and names both the declaration and the expected path.
2. **Given** the manifest declares an icon at a stated size, **When** the file's actual pixel
   dimensions differ from the declared size, **Then** the build fails.
3. **Given** `index.html` links an icon, **When** the linked file is absent, **Then** the build
   fails on the same terms.
4. **Given** every declared icon exists at its declared size, **When** the check runs, **Then** it
   passes without an allow-list.

---

### User Story 6 - The next person knows where the mark came from (Priority: P3)

Somebody arriving at this repository in six months opens the icons README and finds a record of what
the assets are, which source they derive from, and how to regenerate them — not a warning about a
placeholder that no longer exists, and not silence.

**Why this priority**: Housekeeping the existing README explicitly asks for. Low risk, and it is the
step most likely to be skipped once the pixels look right.

**Independent Test**: Read `apps/web/public/icons/README.md` after the change and confirm it
describes what is actually on disk.

**Acceptance Scenarios**:

1. **Given** the real assets are in place, **When** a reader opens the icons README, **Then** it
   records the brand source, the generation command, and the asset inventory.
2. **Given** the real assets are in place, **When** a reader looks for the provisional generator,
   **Then** it is gone, and nothing still references it.

---

### Edge Cases

- **A circular mask crops the maskable icon.** The mark must sit inside the 80% safe zone; a mark
  filling the full 512 loses its node terminals under an Android circle mask.
- **iOS ignores `purpose: maskable` entirely** and renders transparency as black. The apple-touch
  asset must therefore be opaque and separately sized at 180×180 — it cannot be the maskable file
  under another name.
- **The antialiased crop edge against a mismatched plate.** Covered above: the plate must be the
  board's own `#0d1942` or every curve carries a navy halo.
- **The mark at 16px.** The board's own scale tests confirm the shape survives; the derived favicon
  must be produced by downscaling with a filter that preserves the round caps rather than by nearest
  neighbour.
- **The top bar at 320px.** It already carries a label, the conference switcher, a profile control
  and a sign-out control, and the source comment records that at that width *"something has to give,
  and it must be a label rather than a control"*. Adding the mark tightens the tightest row in the
  product. The mark must not push a control off, and must not itself be the thing that overflows.
- **A destination name longer than the strip.** At tablet width the bar carries the destination name
  beside the mark; the name truncates, the mark does not shrink below its declared size.
- **Both the rail and the top bar showing a mark at desktop width.** Two marks, six centimetres
  apart, is worse than none. Exactly one is visible per width band.
- **Offline.** The icons are precached with the shell, so the in-app mark renders offline like the
  rest of the shell. The install-time icons are fetched by the platform at install, which is by
  definition an online act.
- **The brand source is replaced with a differently-sized board.** The pipeline must fail rather
  than crop the wrong rectangle — the crop coordinates are meaningless against different dimensions.
- **`seeds/` still referenced after the move.** The brand source moves to `assets/brand/`; nothing
  may still point at `seeds/logo.png`, and the seed vocabulary (`pnpm db:seed`,
  `apps/api/src/db/seed`) must be left unambiguous.
- **The mark rendered in the wrong colourway for its surface.** A navy mark on the navy rail is not a
  degraded mark, it is an absent one — and it is present in the DOM, correctly sized, correctly
  hidden from assistive technology, and passing every assertion available. The board supplies two
  colourways precisely so this choice has to be made per surface (FR-820b).
- **An in-app mark carrying its own plate.** The board has no alpha, so a naive crop brings its
  background with it: a navy tile in the middle of a cream authentication card (FR-820a).
- **A screenshot showing a real person.** Screenshots depict seeded fixture data only; the prototype's
  Unsplash photographs are of real people and standing decision 13 already forbids them shipping as
  attendee faces (FR-815e).
- **Screenshots swelling the install download.** They are for the install prompt, which reads them
  from the manifest at install time; precaching them puts megabytes onto the device for images the
  installed application never shows (FR-815d).
- **A palette change reaches the splash screen but not the icon.** Today `readColourToken` propagates
  a token change to `theme_color` automatically; the icon plate is a brand constant and will not
  move with it. That asymmetry is deliberate and must be written down where the plate colour lives.

## Requirements *(mandatory)*

### Functional Requirements

#### Brand source of truth

- **FR-800**: The owner-supplied brand board MUST be committed to the repository as the tracked
  source from which every brand asset derives. It is currently untracked.
- **FR-801**: The brand source MUST live at a path whose name denotes brand material.
  **OWNER DECISION**: it lives under **`assets/brand/`**, not `seeds/`. In this repository "seed"
  denotes database seed data — `pnpm db:seed`, `apps/api/src/db/seed`, per-domain seed modules — and
  a brand board under `seeds/` reads as conference fixture data.
- **FR-802**: No file, script, document or configuration may reference the brand source at its old
  `seeds/` location after this feature, **and the `seeds/` directory MUST NOT remain**. It holds
  nothing but the board, and an empty directory named for database seed data is the collision the
  move exists to remove.
- **FR-803**: The brand source MUST be the **only** input to the derived assets. No derived asset may
  be hand-edited, and no second source of the mark may be introduced.

#### Derivation pipeline

- **FR-804**: Every derived brand asset MUST be produced by a script that is readable as code, not
  committed as an opaque binary of unknown provenance. This preserves the convention
  `generate-provisional-icons.mjs` established and is what makes the later vector redraw a change of
  input rather than a second mechanism.
- **FR-805**: The script MUST state, as values a reviewer can read, the crop rectangle taken from the
  board, the plate colour painted behind the mark, the safe-zone inset used for the maskable variant,
  and the output size of each asset.
- **FR-806**: The script MUST be deterministic: running it on a clean checkout MUST reproduce the
  committed assets exactly.
- **FR-807**: The script MUST **fail loudly** if the brand source is absent, or if its dimensions
  differ from those the crop coordinates assume, naming what it expected. It MUST NOT emit a
  plausible-looking asset from an unexpected source.
- **FR-808**: The derived assets MUST be committed, so that a build does not depend on running the
  script and a reviewer sees exactly what ships.
- **FR-809**: The plate colour MUST be the **brand navy sampled from the board** (`#0d1942`), and the
  script MUST record why: the board carries no alpha channel, so the mark's antialiased edges are
  blends against that navy, and any other plate colour produces a visible halo. This is an explicit,
  reasoned exception to the design-token colour rule — it is a **brand constant**, not a UI colour,
  and it deliberately does not move when a token moves.

#### PWA install assets

- **FR-810**: The three provisional icons MUST be replaced at their existing names and sizes —
  `icon-192.png` (192×192), `icon-512.png` (512×512), `icon-maskable-512.png` (512×512).
- **FR-811**: The maskable variant MUST keep the entire mark inside the **80% safe zone** platforms
  may crop to — and the safe zone is a **circle whose diameter is 80% of the icon's smallest
  dimension**, so it is the mark's bounding-box **diagonal** that must fit, not its height. Stated
  explicitly because the obvious reading of "80%" sizes the mark to the square and puts its corners
  outside the circle, which is what a first draft of this spec did (research R1).
- **FR-812**: An **`apple-touch-icon` at 180×180** MUST be added with a **fully opaque** plate. iOS
  ignores `purpose: maskable` and renders transparency as black, so this cannot be satisfied by
  reusing the maskable file.
- **FR-813**: The apple-touch icon MUST be linked from `apps/web/index.html`, which has never had
  one.
- **FR-814**: No derived install asset may show the provisional placeholder's diagonal band, disc, or
  any other placeholder motif.
- **FR-815**: The total added weight of the precached asset set MUST be **recorded in the rewritten
  icons README** (FR-837), stated as a number, because **no existing gate measures it**: the asset
  budget walks the build manifest's entry chunk and gzips only `.js`, so static files under `public/`
  never appear in it. A figure that lives only in a pull-request description is gone by the next
  feature; the README is where the next person replacing these assets will look.

#### Manifest screenshots

- **FR-815a**: The manifest MUST declare **screenshots** of real product surfaces, so that platforms
  showing a rich install prompt show MyNet rather than a name and an icon.
- **FR-815b**: Screenshots MUST depict **real, current surfaces** of the built application — not
  mock-ups, not prototype frames, and not surfaces that no longer exist.
- **FR-815c**: Screenshots MUST be **regenerable by a repeatable procedure** rather than hand-captured
  once, so that a later interface change can be reflected without anyone reconstructing how the
  originals were made. They are the one asset class in this feature that does **not** derive from the
  brand board, and the spec says so rather than leaving FR-804 to be read as covering them.
- **FR-815d**: Screenshots MUST be **excluded from the service worker's precache set**. The precache
  glob takes every PNG under `public/`, and a screenshot is shown by the platform's install prompt at
  install time — it is of no use to an installed application and must not be part of what an attendee
  downloads onto a phone at a venue. This is the same exposure that deferred the splash matrix
  (FR-840), applied to the one asset class in this feature that shares it.
- **FR-815e**: Screenshots MUST NOT contain real attendee data. Any person, message, contact or
  appointment visible in one is seeded fixture data, and no address, avatar photograph of a real
  person, or verification state belonging to a real account may appear.

#### Browser chrome

- **FR-816**: A favicon set MUST be added and linked from `apps/web/index.html`, which today has no
  favicon link of any kind.
- **FR-817**: The favicon set MUST cover the sizes browsers actually request, including the 16px case
  the board's own scale tests were drawn to validate.
- **FR-818**: The favicon assets MUST be produced by **downscaling with a resampling filter that
  preserves the round caps** — not by nearest-neighbour, which breaks them into steps at 16px. This
  half is mechanical and verifiable.
- **FR-818a**: Whether the mark **reads** as the MyNet "N" at 16px is a **human judgement and is
  assigned to review**, not to a gate. No automated check can make it, and stating it as though one
  could would be a gate that never fails. The board's own 32/24/16px scale tests are the reference
  the reviewer compares against.
- **FR-819**: The document title and description in `index.html` MUST be unchanged. FR-049's single
  branding constant remains the source of the product name.

#### The in-app mark

- **FR-820**: The mark MUST ship as an **image beside live text**, never as a raster lockup. `MyNet`
  stays real text in `font-display` (Outfit), which matches the board wordmark's genre closely.
- **FR-820a**: The in-app mark MUST carry **no plate of its own** — the mark on transparency, taking
  the surface behind it. The board has no alpha channel, so this is a derivation obligation rather
  than a crop: an in-app asset produced the way the install icons are produced would put a navy square
  in the middle of a cream authentication card.
- **FR-820b**: **The colourway MUST be chosen per surface, and the board supplies two for exactly this
  reason.** On a **dark** surface the mark is the light-on-dark colourway; on a **light** surface it
  is the dark-on-light one. Concretely: the desktop rail is the inverse surface, so a navy mark there
  is a navy shape on a navy field and is **invisible** — it takes the coral colourway. The top bar
  sits on a raised light surface and the five authentication cards are light, so those take the navy
  colourway. This is stated as a requirement because getting it wrong is not a degradation, it is a
  mark nobody can see, and no behavioural assertion distinguishes the two.
- **FR-820c**: The in-app mark MUST have **sufficient contrast against the surface it sits on** at
  every band, and the existing accessibility gates MUST continue to pass unchanged.
- **FR-821**: The mark MUST be **decorative to assistive technology**. Existing accessible names,
  headings and landmarks are preserved, not replaced: the rail's `<span>` and every auth screen's
  `<h1>` keep their text, and nothing a screen reader reads today stops being read.
- **FR-822**: The **desktop rail** MUST carry the mark beside the product name.
- **FR-823**: The **top bar** MUST carry the mark at the width bands where the **desktop** rail is
  absent — the mobile band beside the product name, and the tablet band beside the destination name.
  (Originally worded "where no rail is present", which was factually wrong: `TabletRail` exists at
  768–1279px. The enumeration was always the operative half and is unchanged.)
  **OWNER DECISION**: the mobile top bar does carry the mark. The brainstorm had left this open on
  the ground that the bar is contextual and a mark might compete with the destination name.
- **FR-824**: Exactly **one** mark MUST be visible at any width. At desktop width, where the rail is
  present, the top bar MUST NOT show a second one.
- **FR-825**: At 320px the mark MUST NOT displace or shrink any control. The bar already carries a
  label, the conference switcher, a profile control and a sign-out control at that width; the
  established rule is that a **label** yields before a control does, and the mark must not become the
  exception. No content or primary action may require horizontal scrolling (Principle IV).
- **FR-826**: All **five** authentication screens — `SignInScreen`, `SignUp`, `Verify`,
  `ResetRequest`, `ResetPassword` — MUST carry the mark. **OWNER DECISION**: the **stacked**
  arrangement, mark centred above the existing heading. Three of the five carry no product name
  today, so on those screens the mark introduces brand presence rather than joining a wordmark; their
  heading text is unchanged regardless.
- **FR-827**: The width band in which each mark appears MUST be expressed in CSS, not chosen in
  JavaScript — matching how the navigation already selects its form, so that at any width exactly one
  is in the accessibility tree and the tab order, and no browser API is read from feature code
  (FR-045).

#### Manifest and colour

- **FR-828**: The manifest MUST declare the apple-touch icon and any newly added icon alongside the
  existing three, each with its true size.
- **FR-829**: `background_color` and `theme_color` MUST continue to be **read from the token file at
  build time** by `readColourToken`. FR-008 admits no manifest exemption, and this feature introduces
  none.
- **FR-830**: The re-check the icons README asks for MUST be performed and recorded: that
  `background_color` (cream-100) and `theme_color` (navy-800) still suit the mark. The finding — that
  the icon plate and `theme_color` differ by the brand/token navy gap — MUST be written down as an
  accepted interim cost, not silently left.
- **FR-831**: **No design token may change value in this feature.** Whether `navy-800` and
  `coral-500` adopt the brand's values is a separate decision (Open Question 1), and taking it here
  would repaint the entire product and force the accessibility suite to re-pass on new contrast
  ratios.

#### The declared-icon existence gate

- **FR-832**: A check MUST fail the build when an icon **declared** in the web app manifest, or
  **linked** from `index.html`, has no corresponding file. Expectations MUST be derived from the
  declarations themselves, in the spirit of `deletion-coverage` and `export-coverage`, so that a
  newly declared icon with no file **fails by existing** rather than requiring anyone to remember to
  extend the check.
- **FR-833**: The same check MUST fail when a declared icon's **actual pixel dimensions** differ from
  its declared size. A 192 declaration pointing at a 512 file installs badly and no other gate looks.
- **FR-834**: The check MUST require no allow-list to pass on the assets this feature ships. Any
  future exemption MUST carry a written reason, as the deletion and export coverage tests require.
- **FR-835**: The check MUST run in the existing correctness gates rather than as a manual step.

#### Housekeeping the icons README asks for

- **FR-836**: `scripts/generate-provisional-icons.mjs` MUST be deleted, and nothing may still
  reference it.
- **FR-837**: `apps/web/public/icons/README.md` MUST be rewritten to record the source of the real
  assets, the command that regenerates them, and the inventory of what is on disk. Its
  "PROVISIONAL, NOT BRANDING" framing MUST NOT survive assets that are neither.
- **FR-838**: `CLAUDE.md`'s open-questions entry *"Real brand mark and application icons. None exist
  here"* MUST be updated, and the delivery roadmap's long-lead gate marked met.
- **FR-839**: Any other document asserting that no logo exists MUST be corrected in the same change.

#### Absences and follow-ups

- **FR-840**: **No iOS `apple-touch-startup-image` splash set** ships in this feature. It MUST be
  booked as a named follow-up carrying the requirement that the splash images be **excluded from the
  precache glob** — `injectManifest` globs every PNG under `public/`, and a full device matrix is
  several megabytes silently added to the install download.
- **FR-841**: **No `purpose: "monochrome"` icon variant** ships in this feature. Booked as a named
  follow-up.
- **FR-842**: **A vector redraw of the mark MUST be booked as a named follow-up.** Its
  justification is **resolution independence for sizes not yet asked for** — a larger asset, a
  monochrome variant, a print use — and it is a change of input to the pipeline FR-804 establishes.
  It is explicitly **not** justified by present degradation: research R1 established that every
  asset this feature ships is at or below the mark's native resolution. Recorded this way so that
  nobody later reads a booked follow-up as evidence that something shipped soft.
- **FR-843**: **No brand asset may be added to the application's JavaScript bundle** in a form that
  materially grows it. The in-app mark is a static asset, not an inlined data URI large enough to
  move the shell.
- **FR-844**: **No attendee data is collected, stored or transmitted by this feature**, and no
  network request is added. Every asset is static and identical for every attendee.
- **FR-845**: **No schema change, no migration, and no seed data change.** This feature claims no
  migration number.

#### Governance — the amendment this feature carries

*FR-846 through FR-850 were **discharged on 2026-08-10**: the owner ratified constitution **v3.4.0**,
which strikes register entry 2 in place, adds the binding block "Brand identity and application
icons", records standing decision 27, opens entry 23, and leaves entry 4 open and escalated. They
are retained rather than deleted because they state what the amendment had to contain, and a later
reader checking whether it does needs the list.*

- **FR-846**: A **constitution amendment MUST be drafted and ratified** closing register **entry 2**
  — *"Real brand mark and application icons"* — recording that the owner supplied the brand board on
  2026-08-10 and that the supply is the client decision the entry was waiting for. Without this, every
  other requirement here can pass while the governing document still says no logo exists.
- **FR-847**: The amendment MUST carry a **standing decision** recording what was settled: that the
  board is the brand source, that the icon plate is the brand navy rather than the token navy and why,
  and the four scope answers the owner gave on 2026-08-10 — `assets/brand/` as the source location,
  the mark in the mobile top bar, the stacked lockup on authentication screens, and core-only scope
  with the splash matrix, the monochrome variant and the vector redraw deferred.
- **FR-848**: The amendment MUST **not** close register entry 4 (desktop and tablet layouts never
  validated by the client). This feature escalates it and does not resolve it, and an amendment that
  quietly took it would answer a question nobody asked (Principle I).
- **FR-849**: The amendment MUST be **ratified before implementation begins**, following the precedent
  of v3.1.0 and v3.2.0, because it is what makes the brand assets a decision the product is entitled
  to ship rather than a mark somebody drew.
- **FR-850**: The register entry's struck-through form MUST be retained in place rather than deleted,
  so entry numbering stays stable — the convention every prior resolution in this register follows.

### Key Entities

- **Brand source board**: the single tracked image supplied by the owner. 1254×1254, no alpha,
  carrying the mark in two colourways, two lockups, scale tests and a monochrome test. The only
  input to every derived asset.
- **Derived asset set**: the install icons, apple-touch icon and favicons produced from the board by
  the generation script. Committed, deterministic, and each one declared somewhere that the existence
  gate reads.
- **Brand constants**: the plate navy `#0d1942` and the mark coral `#fe6551`, sampled from the board.
  Distinct from the design tokens by measurement, and deliberately not governed by them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-801**: An attendee installing MyNet sees the MyNet mark on their home screen — **zero**
  surfaces still show the provisional placeholder, and the provisional generator no longer exists in
  the repository.
- **SC-802**: The maskable icon keeps **100%** of the mark inside the 80% safe zone; a circular mask
  removes no part of it.
- **SC-803**: The icon added for iOS is fully opaque — **zero** transparent pixels — so no device
  renders any part of it as black.
- **SC-804**: **Every** browser tab showing MyNet carries the mark; the count of surfaces showing the
  browser default document glyph falls from all of them to **zero**.
- **SC-805**: The mark is present in the shell at **all three** width bands, and **exactly one** mark
  is visible at each.
- **SC-806**: **Zero** destinations require horizontal scrolling at any width from 320px, unchanged
  from today, with the mark present.
- **SC-807**: **Zero** accessible names, headings or landmarks change. The set of text a screen reader
  announces in the shell and on the five authentication screens is identical before and after.
- **SC-808**: **All five** authentication screens carry the mark.
- **SC-809**: Re-running the generation script on a clean checkout reproduces the committed assets
  with **zero** differences.
- **SC-810**: An icon declared but absent, or present at the wrong dimensions, fails the build — and
  this is demonstrated, not asserted.
- **SC-811**: **Zero** design tokens change value, and the count of colour literals outside the token
  file does not rise except for the brand constants declared under FR-809, which are named and
  reasoned in one place.
- **SC-812**: The initial shell JavaScript remains within the existing asset budget, and the added
  weight of the static asset set is **stated as a number** in the change.
- **SC-813**: **Zero** references to the brand source at its former `seeds/` path remain anywhere in
  the repository, and the `seeds/` directory is gone.
- **SC-814**: The mark is visible against its surface on **every** surface that carries it — **zero**
  surfaces render the mark in a colourway that matches the background it sits on.
- **SC-815**: The manifest declares screenshots of real current surfaces, and **zero** of them enter
  the precached asset set or contain data belonging to a real account.
- **SC-816**: Register entry 2 is closed by a ratified amendment, and the count of documents still
  asserting that no logo exists in this repository falls to **zero** — constitution, `CLAUDE.md`,
  delivery roadmap and icons README included.
- **SC-817**: The number recording the added precached weight is present in the icons README and is a
  figure, not a description.

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Offline behaviour** (Principle VI) | **Nothing is cached that was not already.** The brand assets are part of the application shell, precached with it, so the in-app mark renders offline exactly as the rest of the shell does. No repository, no network request and no caching decorator member is involved — there is no read to declare live or cached. Install-time icons are fetched by the platform during installation, which is by definition an online act. The precache set grows by the size of the derived assets, and **that growth is recorded as a number in the icons README** (FR-815) precisely because no gate measures it. **Screenshots are the one exception and are excluded from the precache set** (FR-815d): the install prompt reads them at install time, and an installed application never shows them. |
| **Desktop layout** (Principle IV) | Persistent left rail carries the mark beside the product name, above the navigation — in the **light-on-dark colourway**, because the rail is the inverse surface (FR-820b). The top bar carries **no** mark at this band (FR-824). Authentication screens: mark centred above the heading in the existing centred card, in the **dark-on-light** colourway. |
| **Tablet layout** (Principle IV) | The top bar carries the mark beside the **destination** name, dark-on-light against the raised surface. **A rail does exist at this band** — `TabletRail`, 768–1279px, on the inverse surface — and it carries no brand; putting the mark there instead is the alternative this feature did not weigh, and is an open owner question (register entry 4). |
| **Mobile layout** (Principle IV) | Compact header carries the mark beside the product name, dark-on-light. The mark is sized and constrained so that the conference switcher, profile control and sign-out control are untouched at 320px, and a label yields before a control does (FR-825). |
| **Empty / loading / failure states** (Principle IV) | **None apply, and the absence is declared rather than omitted.** This feature adds no surface that reads data: no request, no repository call, no asynchronous state. A static asset that fails to load degrades to its alternative text, which is empty by design because the mark is decorative and the product name beside it is live text — so a failed image leaves the surface fully readable rather than nameless. |
| **Accessibility** (Principle IV) | The mark is decorative and hidden from assistive technology; every existing accessible name, heading and landmark is preserved unchanged (FR-821, SC-807). No control is added, so no new label, focus state or keyboard path is introduced — and no existing one is displaced (FR-825). Width-band selection stays in CSS so exactly one navigation and one mark are in the accessibility tree at any width (FR-827). |
| **Validation checklist discharged** (Principle VII) | Discharges the **brand mark and application icons** long-lead gate the roadmap flags for 010, and contributes to **desktop and mobile rendering**. Does **not** discharge the rest of Launch Readiness — the full end-to-end checklist sweep, the accessibility sweep across five destinations, the performance pass, the physical iPhone test, or the PWA caching review — all of which remain outstanding. |
| **Identity scoping & server-side authorization** (Principle VIII) | **Not applicable, and the reason is structural rather than an oversight.** This feature stores, reads and transmits **no attendee data** (FR-844). It adds no route, no query and no repository, so there is nothing to scope by identity and no authorization decision to place on the server. Every asset it ships is static and identical for every attendee, signed in or not. **One personal-data obligation does attach**: manifest screenshots depict product surfaces, so they must show seeded fixture data and never a real account's address, avatar or messages (FR-815e) — the repository is public, and a screenshot is world-readable the moment it is committed. |
| **Deletion & export coverage** (Principle VIII) | **No table and no column are added** (FR-845), so `deletion-coverage` and `export-coverage` gain nothing to cover and neither needs an allow-list entry. No retention clock is required, because no record is created that a cascade could fail to reach. |
| **Event scoping** (Standing decision 7) | **Neither rule applies, and that is itself the declaration standing decision 7 demands.** Decision 7 says every new **table** declares which rule applies; this feature adds none. The assets are product identity — not conference content and not a relationship — so they are identical at every event and do not swap on switch. |
| **Register position** (Governance) | **Resolves register entry 2** — *"Real brand mark and application icons"*, the oldest entry in the register — answered by the owner supplying the brand board on 2026-08-10. **RATIFIED as constitution v3.4.0 on 2026-08-10**, before implementation as FR-849 requires, following the precedent of v3.1.0 and v3.2.0. Standing decision 27; the operative rule now lives in a binding block, *"Brand identity and application icons"*, because a struck-through entry is not where anybody looks for a rule. **Blocked by no entry.** **Opens one entry — 22**, whether the design tokens adopt the brand's navy and coral (FR-831 forbids this feature resolving it). Does not touch entries 20 (VAPID custody) or 21 (the operator address). **Register entry 4 — desktop and tablet layouts never validated by the client — is escalated by this feature and explicitly NOT closed by the amendment** (FR-848, Open Question 3). |
| **Reserved migration number** (Branching — parallel work) | **None claimed.** The roadmap reserves `0008` for 009 and this feature needs no schema change, so 009 may proceed in parallel without a rebase. Nothing here regenerates the Drizzle snapshot, so `apps/api/migrations/meta/README.md` is untouched. |

## Assumptions

- **The board is final for raster purposes.** The mark is **cropped** from the board rather than
  redrawn. The vector redraw is booked (FR-842) and will replace the input to the same pipeline.
- **Nothing is upscaled**, corrected at planning by research R1: the maskable safe zone is a circle
  of 80% *diameter*, so the largest mark that fits a 512px maskable icon is 297.9px — 0.993× of the
  board's native 300px. The earlier 1.37× figure came from treating the safe zone as 80% of the
  side, which would have put the node terminals outside it and had them clipped by a circular mask.
- **The navy seam is accepted, knowingly.** The icon plate is brand navy `#0d1942`; `theme_color` is
  token `navy-800 #1b2340`; they meet on the splash screen. Accepted until Open Question 1 is
  settled, and recorded rather than hidden.
- **The mark appears in the top bar at the tablet band as well as the mobile band.** The owner's
  decision named the mobile top bar; extending it to tablet is an inference, stated here because it
  is reviewable rather than settled.

  **CORRECTED after implementation — the premise this inference rested on was false.** It read
  "the rail is desktop-only (`≥1280px`), so the tablet band has no brand presence anywhere". A rail
  *does* exist at the tablet band: `TabletRail` renders `tablet:flex desktop:hidden` on
  `bg-surface-inverse`, live from 768px to 1279px. What is desktop-only is `DesktopRail`, not "the
  rail", and FR-823's original predicate — "the bands where **no rail is present**" — therefore
  contradicted its own enumeration.

  The delivered arrangement (mark in the top bar at mobile and tablet, in the rail at desktop) is
  unchanged and still satisfies FR-823's enumeration and FR-824. But the alternative it appeared to
  rule out — the mark at the head of `TabletRail` in coral, mirroring `DesktopRail` exactly — was
  never actually weighed, because the spec recorded that surface as not existing. **It is an open
  layout question for the owner**, and belongs with register entry 4 rather than being treated as
  decided here.
- **The board's own scale tests are treated as validation** that the mark holds at 32/24/16px. They
  were drawn for that purpose.
- **The asset budget does not cover this feature's assets, and that was confirmed rather than
  assumed.** `scripts/asset-budget.mjs` reads the Vite build manifest, takes the entry chunk and
  every chunk it statically imports, and gzips **only `.js` files**. Static files under `public/`
  never appear in that manifest. So the derived assets can add any amount to the install download
  with **no gate objecting** — which is why FR-815 requires the number to be stated, and why the
  splash matrix (FR-840) was the right thing to defer.
- **The existence gate is a build-time check over declarations and files**, not a device test. It
  cannot prove an icon looks right; it can make a missing or mis-sized one fail fast.
- **Existing infrastructure is reused**: 001's manifest generation and `readColourToken`, 001's
  responsive width bands and the CSS-only band selection the navigation established, 007's
  `injectManifest` service worker and its precache glob, and the existing correctness gates.
- **`sharp` is available for the pipeline** — it is already an `apps/api` dependency, so the
  derivation adds no new third-party dependency to the client.

## Open Questions

**1. Whether `navy-800` and `coral-500` adopt the brand board's values (`#0d1942`, `#fe6551`).**
**Now constitution register entry 23**, opened by amendment v3.4.0 rather than left in this document
alone — it outlives the feature, and a question visible only in a feature spec is invisible to the
register that governs it. Deliberately deferred, and **this feature must not resolve it** (FR-831). Adopting them would make
the board the single source of truth and remove the splash-screen seam — but `navy-800` is the
primary surface and `coral-500` the accent and the focus ring, so it repaints the entire product and
the accessibility suite must re-pass on every new contrast ratio. Until it is settled the icon plate
and the token-derived `theme_color` differ visibly on the splash screen. **Blocks nothing**; the
product behaves as specified either way.

**2. Whether the favicon set should include an `.ico` container.** A modern browser is satisfied by
PNG links, but some contexts still request `/favicon.ico` by convention at the site root, and a
request that 404s is a small, permanent noise in the logs. A planning decision about the set's
contents, not a client one.

**3. Desktop and tablet layouts remain unvalidated by the client — register entry 4 — and this
feature adds a visible element to both.** CLAUDE.md records that the first human to look at a dialog
found it rendering in the **top-left corner** after it had passed 135 end-to-end tests, five review
agents and CodeRabbit. **A brand mark's position and size is exactly that class of defect**: every
behavioural assertion available will pass on a mark that is present, decorative, and twice the size
it should be, or crowding the sign-out control at 320px. The spec's answer is to assert what can be
asserted — that exactly one mark exists per band, that no destination overflows horizontally, and
that no control is displaced — and to state plainly that **whether it looks right is a human review
this feature does not substitute for**. It joins the outstanding `quickstart.md` walkthroughs from
007 and 008 rather than replacing them.
