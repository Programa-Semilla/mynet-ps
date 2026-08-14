# Application icons

**These are the real MyNet brand mark.** They replaced a deliberately-unusable placeholder — a
navy square with a coral disc struck through by an amber diagonal band — which existed only so
that the manifest validated and the application was installable while MyNet had no logo.

MyNet had no logo for the entire life of this project. Constitution register entry 2 was the
oldest entry in the register, open since 1.0.0, and it could not be closed from inside the
repository because it needed an asset only the client could supply. **The owner supplied a brand
board on 2026-08-10**, ratified as constitution v3.4.0, standing decision 30.

**Feature 016 then replaced the files in this directory from a _second_ source.** Everything below
describes what is on disk now; where 010's answer still stands, it says so.

## The two sources, and the boundary between them

There are **two** brand sources and **two** derivation pipelines writing into `apps/web/public/`.
That is deliberate, ratified, and the thing most worth understanding before changing anything here.

| Source                      | Pipeline                             | Owns                                                                                 |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| `assets/brand/logo.png`     | `scripts/generate-brand-assets.mjs`  | Every **in-app** mark, in both products, and **every administrative asset**          |
| `assets/brand/new-logo.png` | `scripts/generate-install-icons.mjs` | **The files in this directory**, plus `../apple-touch-icon.png` and MyNet's favicons |

Constitution **v5.0.0, standing decision 43**: the second source is for install icons and favicons
only, and **this is not a rebrand**. The in-app coral mark is untouched, and the administrative
site's favicons are deliberately untouched too, which scopes the divergence to one product rather
than spreading it to a third surface.

**The home-screen icon therefore visibly differs from the mark inside the application.** That is
**knowingly accepted** and is **register entry 28** — which of the two marks is MyNet's is an open
question, and **no feature may resolve it by quietly replacing one mark with the other.**

The two pipelines write **disjoint** sets of files. `scripts/brand-audit.mjs` and
`scripts/generate-install-icons.test.mjs` each assert that, because a collision would mean the
committed asset depended on which command ran last.

## How they are made

```bash
pnpm brand:generate:install   # this directory, apple-touch-icon and MyNet's favicons
pnpm brand:generate:board     # the in-app marks and every administrative asset
pnpm brand:generate           # both, in that order — the pipelines are disjoint, so this is safe
pnpm brand:audit              # checks the committed bytes against both pipelines (needs a build)
```

**`pnpm brand:generate` alone used to run the board pipeline only, and it writes none of these
files.** If you are reading an older note that gives `node scripts/generate-brand-assets.mjs` as the
regeneration command for this directory, it is wrong: that script stopped writing here at 016, and
running it produces no change to any file listed under "MyNet's install icons" below.

**Derived by a readable script, never committed as opaque binaries.** That is a governance rule,
not a preference (constitution v3.4.0, decision 30): a reviewer verifies the crop rectangle, the
plate colour and the maskable safe-zone inset by _reading code_, rather than by opening a PNG and
trusting it. Regeneration is byte-identical (FR-1042), so a hand-edited asset shows up as a diff
that regeneration cannot reproduce.

**The two pipelines are two ideas, not one idea with a switch.** The board has no alpha channel, so
its coral mark exists only as coral pixels composited against the board's navy, and
`generate-brand-assets.mjs` undoes that algebraically — every pixel is `P = α·F + (1−α)·B`, so
`α = (P − B) / (F − B)`, solved on the red channel where the coral/navy delta is 241 of 255. **None
of that transfers.** The second source has an alpha channel, its mark is a gradient rather than one
flat colour, and there is no single `F` to solve against — so `generate-install-icons.mjs` has its
own dimension guard, its own crop and its own plate. Parameterising one script over both was
considered and rejected: a flag-selected constant set is how the wrong crop applies silently.

## What is here, and where

MyNet's install icons and favicons, from **`new-logo.png`**:

| File                      | Size    |  Bytes | Purpose                                                     |
| ------------------------- | ------- | -----: | ----------------------------------------------------------- |
| `icon-192.png`            | 192×192 |  3,357 | Home screen, standard density                               |
| `icon-512.png`            | 512×512 | 12,189 | Splash screen and store listings                            |
| `icon-maskable-512.png`   | 512×512 | 11,730 | `purpose: maskable` — see the safe-zone note below          |
| `../apple-touch-icon.png` | 180×180 |  3,178 | iOS home screen. **Fully opaque**                           |
| `../favicon-32.png`       | 32×32   |  1,462 | Tab, bookmark, pinned tab — the size hidpi displays ask for |
| `../favicon-16.png`       | 16×16   |    811 | Tab at standard density                                     |
| `../favicon.ico`          | 16 + 32 |  2,311 | Clients that guess `/favicon.ico` without reading the HTML  |

Neighbours in `apps/web/public/` that this pipeline does **not** write:

| File                      | Size    |   Bytes | Source                                           |
| ------------------------- | ------- | ------: | ------------------------------------------------ |
| `../brand/mark-coral.png` | 151×160 |   9,816 | The **board** — in-app mark for inverse surfaces |
| `../brand/mark-navy.png`  | 151×160 |   9,353 | The **board** — in-app mark for light surfaces   |
| `../screenshots/*.png`    | 6 files | 436,481 | Install-prompt illustrations. **Not precached**  |

### The maskable safe zone is a circle, and the obvious reading is wrong

A maskable icon's guaranteed-visible region is a **circle whose diameter is 80% of the icon's
smallest dimension** — not 80% of the side available to a bounding box. A rectangle's corners
escape a circle: what must fit is the bounding box's **diagonal**, which for a square mark in a 512
icon gives `0.8 × 512 / √2 = 289.6px` rather than 409.6px.

**The rule is carried over from 010 unchanged, and for this mark it is deliberately conservative.**
The new mark happens to be a disc, so its bounding-box corners are empty white and the naive sizing
would clip nothing visible. Two reasons it is applied anyway: the rule would otherwise depend on the
artwork being circular, which is a property of one export rather than of the brand — a later source
with a square badge would silently start losing corners — and one geometry across both pipelines
means there is one thing to be right about. The cost is a mark 2.5% smaller than the standard
icon's, which is not visible.

`scripts/generate-install-icons.test.mjs` pins the geometry, asserts the wrong answer is wrong, and
measures the **shipped** 512 maskable PNG pixel by pixel — because a pure function is not what
installs.

### The apple-touch icon is not the maskable file renamed

iOS ignores `purpose: maskable` and paints transparency **black**. A transparent apple-touch icon
is therefore not a degraded icon, it is a black square. Its plate is fully opaque, asserted by
pixel inspection rather than by inspection on a device.

## The plate is WHITE, and 010's navy plate is gone from these files

**010's answer — the brand navy `#0d1942`, measured from the board — no longer applies here.** The
plate for every file in the first table above is **white**, `#ffffff`, and it is a deliberate
choice recorded in the `PLATE` docblock of `scripts/generate-install-icons.mjs`. Read that before
changing it; the argument in short:

The board pipeline did not _choose_ navy, it **measured** it. The board has no alpha channel, so
its mark exists only as coral composited against the board's own navy, and any other plate would
ring every antialiased edge with a colour that was never in the design. The second source **has**
an alpha channel — but every one of its 15,162 pixels is fully opaque, and the mark is drawn on
**white**. Its edges are blends against white in exactly the way the board's are blends against
navy. So the same reasoning gives a different answer: white is not a preference, it is the only
plate that introduces no fringe, and plating this mark onto the board's navy would ring every curve
in white.

This is the one claim a reviewer is told to verify by reading code rather than by opening a PNG, so
it is worth stating plainly: **if this document and `PLATE` disagree, `PLATE` is what ships.**

## The mark is enlarged ~3.23×, once, and that is a recorded exception

010 established that **nothing is upscaled**, and enforced it after finding a single asset drawn at
1.06× — fixing the _asset_ rather than weakening the check. **These files cannot satisfy that.**
`new-logo.png` is 114×133 and its mark is 92×92; a 512 icon needs ~297px of it. The owner confirmed
no higher-resolution source exists and licensed the crop, so the enlargement is accepted **once,
named, and measured** (FR-1045).

The exception is three coordinates — **this source, this factor, these outputs** — and
`scripts/brand-audit.mjs` checks the factor for **equality** rather than as a ceiling, because a
ceiling is what quietly absorbs the next one. Four outputs are covered (`icon-192`, `icon-512`,
`icon-maskable-512`, `apple-touch-icon`); the two favicons are downscales. **Weakening the check
until it stops checking anything is forbidden**, and widening the exception means editing a number
the audit compares against, which is the conversation.

The factor is derived from the pipeline's own inventory rather than restated, and the audit
requires the measured set to be **exactly** the set of files the pipeline draws. That closes the
gap 016's deep review found: a hand-kept scale list would have let a new `icon-1024.png` ship at
6.46× with every check green. **The board pipeline keeps the original rule** — nothing derived from
`logo.png` is enlarged at all, asserted separately so the exception cannot leak across.

## Weight

**Nothing in the install download changed at 016.** Only the two in-app marks are shell assets, and
they come from the board, which this feature did not touch.

|                                                         |   Bytes | In the install download?                       |
| ------------------------------------------------------- | ------: | ---------------------------------------------- |
| The two in-app marks (`../brand/mark-*.png`)            |  19,169 | **Yes** — the shell renders them on every page |
| MyNet's install icons + apple-touch + favicons + `.ico` |  35,038 | **No**                                         |
| Six install-prompt screenshots                          | 436,481 | **No**                                         |

Re-measured 2026-08-12 with `stat -c %s`, after 016 replaced the icon set. **The icon set got
lighter**: 010's seven files totalled 80,748 bytes against a navy plate; the same seven from the
second source total 35,038, because a white plate and a simpler mark compress far better. That is a
side effect worth recording rather than a goal — none of it was in the install download either way.

**Only the in-app marks are shell assets.** Manifest icons and favicons are fetched by the
_browser process_, not from a document, so those requests never reach the service worker and can
never be answered from its cache — precaching them would download bytes onto every device to
satisfy requests that never arrive. `includeManifestIcons: false` in `apps/web/vite.config.ts` is
what governs them; `globIgnores` alone does **not**, because the plugin appends manifest-declared
icons to the precache list after the glob runs. The screenshots are excluded for the same reason
the spec gives (FR-815d): the install prompt fetches them online, at install time.

`scripts/brand-audit.mjs` asserts all of this against the **built** worker, and runs in
`pnpm verify` right after `pnpm build`. It replaced a unit test that could never run — the unit
layer does not build, so the check skipped on every CI run and reported green.

**No gate measures the total.** `scripts/asset-budget.mjs` walks the build manifest's entry chunk
and gzips only `.js`, so static assets are outside it entirely. The numbers above are recorded by
hand for that reason; if this directory changes materially, re-measure and update them.

## The manifest colour seam is now wider, and it is still not fixed

The icon plate is a **brand constant, not a design token**, and it deliberately does not move when
a token moves. The two answer different questions: `navy-800` and `coral-500` are the _product's_
surface and accent and may be retuned for contrast or a dark mode; the plate and the mark are the
identity a person recognises on their home screen. A token change must not repaint the application
icon.

`scripts/brand-audit.mjs` requires the manifest's colours to be **derived from the token file**
(FR-829), so:

| Manifest value     | Source      | Value     | Against the icon                |
| ------------------ | ----------- | --------- | ------------------------------- |
| `background_color` | `cream-100` | `#fdf8f3` | Cream, behind a **white** plate |
| `theme_color`      | `navy-800`  | `#1b2340` | Navy, framing a **white** plate |
| _(icon plate)_     | this source | `#ffffff` | —                               |

**010 recorded a navy-vs-navy seam as knowingly accepted. This one is materially larger**: a launch
screen now shows **three** grounds — cream, white and navy — where 010 showed two shades of one.
It is stated rather than fixed because both repairs are somebody else's decision: repainting the
plate is the one thing the argument above says cannot be done without a fringe, and moving
`theme_color` or `background_color` off the tokens is **register entry 23**, which asks whether
`navy-800` and `coral-500` should adopt the brand's values and is explicitly the owner's call.

**No gate can see it.** Every colour is asserted somewhere and every assertion passes; what nobody
checks is how the three look together, because that is a photograph of a phone at launch. It
belongs on **T068's** by-hand list, beside judging the icon itself.

## Booked follow-ups

Deliberately out of scope, and recorded in
`specs/010-brand-mark-and-app-icons/follow-ups.md` rather than left as a note in prose:

1. **The iOS `apple-touch-startup-image` splash matrix** — many device-specific images, which must
   carry the precache exclusion with them or they land in every install download.
2. **A `purpose: "monochrome"` icon variant** — the board carries a monochrome test, but declaring
   the purpose without a purpose-drawn asset lets platforms recolour the mark arbitrarily.
3. **A vector redraw of the mark.** The reason was resolution independence for sizes not yet asked
   for; since 016 it is also the answer to the ~3.23× upscale above, which exists only because the
   second source is 114×133. A vector source would remove the exception rather than widen it, and
   would be the natural input for the monochrome variant.
