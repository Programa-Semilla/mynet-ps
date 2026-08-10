# Application icons

**These are the real MyNet brand mark.** They replaced a deliberately-unusable placeholder — a
navy square with a coral disc struck through by an amber diagonal band — which existed only so
that the manifest validated and the application was installable while MyNet had no logo.

MyNet had no logo for the entire life of this project. Constitution register entry 2 was the
oldest entry in the register, open since 1.0.0, and it could not be closed from inside the
repository because it needed an asset only the client could supply. **The owner supplied a brand
board on 2026-08-10**, ratified as constitution v3.4.0, standing decision 27.

## The source

`assets/brand/logo.png` — the owner's brand board, 1254×1254. It is the **only** input to every
file here, and to every other brand asset in `apps/web/public/`. There is no second source, no
hand-exported variant, and no file in this directory that was edited by hand.

## How they are made

```bash
node scripts/generate-brand-assets.mjs
```

**Derived by a readable script, never committed as opaque binaries.** That is a governance rule,
not a preference (constitution v3.4.0, "Brand identity and application icons"): a reviewer
verifies the crop rectangle, the plate colour and the maskable safe-zone inset by _reading code_,
rather than by opening a PNG and trusting it. Regeneration is byte-identical, so a hand-edited
asset shows up as a diff that regeneration cannot reproduce.

**The pipeline is one idea.** The board has no alpha channel, so the coral mark exists only as
coral pixels composited against the board's navy — a naive crop drags that navy into every
antialiased edge. Every pixel is `P = α·F + (1−α)·B`, so the compositing is undone algebraically:
`α = (P − B) / (F − B)`, solved on the red channel where the coral/navy delta is 241 of 255. That
recovers one alpha matte, and every asset below is that matte resampled and painted.

## What is here, and where

| File                      | Size    | Purpose                                                     |
| ------------------------- | ------- | ----------------------------------------------------------- |
| `icon-192.png`            | 192×192 | Home screen, standard density                               |
| `icon-512.png`            | 512×512 | Splash screen and store listings                            |
| `icon-maskable-512.png`   | 512×512 | `purpose: maskable` — see the safe-zone note below          |
| `../apple-touch-icon.png` | 180×180 | iOS home screen. **Fully opaque**                           |
| `../favicon-32.png`       | 32×32   | Tab, bookmark, pinned tab — the size hidpi displays ask for |
| `../favicon-16.png`       | 16×16   | Tab at standard density                                     |
| `../favicon.ico`          | 16 + 32 | Clients that guess `/favicon.ico` without reading the HTML  |
| `../brand/mark-coral.png` | 151×160 | In-app mark for **inverse** surfaces — the desktop rail     |
| `../brand/mark-navy.png`  | 151×160 | In-app mark for **light** surfaces — top bar, auth screens  |
| `../screenshots/*.png`    | 6 files | Install-prompt illustrations. **Not precached**             |

### The maskable safe zone is a circle, and the obvious reading is wrong

A maskable icon's guaranteed-visible region is a **circle whose diameter is 80% of the icon's
smallest dimension** — not 80% of the side available to a bounding box. A rectangle's corners
escape a circle: sized to 80% of the _side_, the mark's bounding box is 386×410 in a 512 icon and
its corners sit 281.5px from centre against a safe radius of 204.8, so **an Android circular mask
clips the two node terminals that are the whole point of the mark**.

What must fit is the bounding box's **diagonal**, which gives a 297.9px mark in a 512 icon — a
0.993× scale of the board's native 300px. **Nothing here is upscaled.** The geometry is pinned by
`scripts/generate-brand-assets.test.mjs`, which asserts the wrong answer is wrong.

### The apple-touch icon is not the maskable file renamed

iOS ignores `purpose: maskable` and paints transparency **black**. A transparent apple-touch icon
is therefore not a degraded icon, it is a black square. Its plate is fully opaque, asserted by
pixel inspection rather than by inspection on a device.

## Weight

**The install download grew by 10,888 bytes (≈11 KiB), not by the whole asset set** — and the
difference between those two numbers is the interesting part.

|                                                 |       Bytes | In the install download?                       |
| ----------------------------------------------- | ----------: | ---------------------------------------------- |
| The two in-app marks                            |      19,169 | **Yes** — the shell renders them on every page |
| The three placeholder icons they replaced       |       8,281 | (was)                                          |
| **Net change to the precache**                  | **+10,888** |                                                |
| Install icons + apple-touch + favicons + `.ico` |      80,748 | **No**                                         |
| Six install-prompt screenshots                  |     436,591 | **No**                                         |

**Only the in-app marks are shell assets.** Manifest icons and favicons are fetched by the
_browser process_, not from a document, so those requests never reach the service worker and can
never be answered from its cache — precaching them would download ~79 KiB onto every device to
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

## The plate colour is a brand constant, not a design token

The icon plate is the brand's navy **`#0d1942`**, measured from the board. It is deliberately
**not** `navy-800`, and it deliberately does not move when a design token moves.

The two answer different questions. `navy-800` and `coral-500` are the _product's_ surface and
accent, and may be retuned for contrast or a dark mode. The plate and the mark are the identity a
person recognises on their home screen. A token change must not repaint the application icon.

**They do not currently agree, and the seam is a known, accepted cost.** Re-checked at the time
these assets were made:

| Manifest value     | Source      | Value     | Suits the mark?                     |
| ------------------ | ----------- | --------- | ----------------------------------- |
| `background_color` | `cream-100` | `#fdf8f3` | **Yes** — the board's cream matches |
| `theme_color`      | `navy-800`  | `#1b2340` | **Differs from the icon plate**     |
| _(icon plate)_     | brand navy  | `#0d1942` | —                                   |

So on the splash screen the plate and the surrounding `theme_color` are visibly different navies.
**This is deliberate and recorded**, not an oversight: whether `navy-800` and `coral-500` should
adopt the brand's values is **constitution register entry 23**, opened by v3.4.0 and explicitly
left for the owner. Adopting them would make the board the single source of truth for colour and
remove this seam — but `navy-800` is the primary surface and `coral-500` is both the accent and the
focus ring, so it repaints the whole product and every contrast ratio must be re-verified. Feature
010 was forbidden from resolving it.

## Booked follow-ups

Deliberately out of scope here, and recorded in
`specs/010-brand-mark-and-app-icons/follow-ups.md` rather than left as a note in prose:

1. **The iOS `apple-touch-startup-image` splash matrix** — many device-specific images, which must
   carry the precache exclusion with them or they land in every install download.
2. **A `purpose: "monochrome"` icon variant** — the board carries a monochrome test, but declaring
   the purpose without a purpose-drawn asset lets platforms recolour the mark arbitrarily.
3. **A vector redraw of the mark.** The reason is **resolution independence for sizes not yet
   asked for**, and it is _not_ present degradation — nothing here is upscaled. A vector source
   would also be the natural input for the monochrome variant.
