# Phase 1 Data Model: Brand Mark and Application Icons

**Feature**: 010 | **Date**: 2026-08-10

## There is no database entity, and the absence is the declaration

This feature adds **no table, no column, no migration and no seed data** (FR-845). It stores, reads
and transmits **no attendee data** (FR-844). `deletion-coverage` and `export-coverage` therefore gain
nothing to cover and need no allow-list entry, and no retention clock is required because no record
is created that a cascade could fail to reach.

What follows is the model that *does* exist: a derivation graph from one source file to a set of
committed assets, and the declarations that name them.

---

## Entity 1 — Brand source

The single tracked input. Everything else in this feature is a function of it.

| Property | Value |
|---|---|
| Path | `assets/brand/logo.png` (moved from `seeds/`, FR-801) |
| Dimensions | 1254 × 1254 |
| Channels | **3 — no alpha** (the fact that shapes the whole pipeline) |
| Mark bounding box | `left: 172, top: 162, width: 283, height: 300` |
| Mark colour | `#fe6551` |
| Plate colour behind the mark | `#0d1942` |

**Invariant**: the crop rectangle is meaningless against a board of different dimensions, so the
generator asserts the dimensions and fails loudly rather than cropping the wrong region (FR-807).

---

## Entity 2 — Alpha matte

The intermediate every asset derives from. Not committed; produced in memory on each run.

| Property | Value |
|---|---|
| Dimensions | 283 × 300, RGBA |
| Derivation | `α = clamp((P.red − 13) / 241, 0, 1)` per pixel, RGB set to the mark colour |
| Measured composition | 60.2% transparent, 37.8% opaque, ~1.2% antialiased edge |

**Why it exists**: the source has no alpha, so a crop carries the board's navy into every edge. One
matte, painted twice, is what makes the two colourways (FR-820b) a single derivation rather than two
crops to keep in sync.

---

## Entity 3 — Derived asset set

Every file is the matte, resampled and composited. All are committed (FR-808) and reproducible
byte-for-byte (FR-806).

### Install and chrome assets — `apps/web/public/`

| Asset | Size | Plate | Mark height | Scale vs native 300px | Notes |
|---|---|---|---|---|---|
| `icons/icon-192.png` | 192 | opaque `#0d1942` | design choice | downscale | Existing name and size (FR-810) |
| `icons/icon-512.png` | 512 | opaque `#0d1942` | design choice | ~1.06× at 0.62 fill | No safe-zone constraint |
| `icons/icon-maskable-512.png` | 512 | opaque `#0d1942` | **≤ 297.9** | **0.993×** | Bounding-box **diagonal** fits the 80%-diameter safe circle (FR-811, R1) |
| `apple-touch-icon.png` | 180 | **opaque, mandatory** | downscale | downscale | iOS renders transparency as black (FR-812) |
| `favicon-32.png` | 32 | opaque | downscale | downscale | The size that must be right (R4) |
| `favicon-16.png` | 16 | opaque | downscale | downscale | Legibility is a human judgement (FR-818a) |
| `favicon.ico` | 16 + 32 | opaque | — | — | Embedded PNG payloads (R9) |

### In-app marks — `apps/web/public/brand/`

| Asset | Height | Plate | Used by |
|---|---|---|---|
| `mark-coral.png` | ~96 | **none — transparent** | Desktop rail (inverse surface) |
| `mark-navy.png` | ~96 | **none — transparent** | Top bar and the five auth screens (light surfaces) |

**Invariant (FR-820a)**: in-app marks carry no plate. An asset produced the way an install icon is
produced would put a navy tile in the middle of a cream authentication card.

**Invariant (FR-820b)**: colourway is a function of the surface's background, not of the component.
Getting it wrong yields an invisible mark that passes every behavioural assertion.

### Screenshots — `apps/web/public/screenshots/`

| Property | Value |
|---|---|
| Source | Captured from the built application against the seeded end-to-end stack (R6) |
| Content constraint | Seeded fixture data only — no real account's address, avatar or messages (FR-815e) |
| Precache | **Excluded** via `injectManifest.globIgnores` (FR-815d) |

---

## Entity 4 — Icon declarations

The data the existence gate reads. Extracted from `apps/web/vite.config.ts` into a module shared by
the config and the test (R5).

| Field | Meaning |
|---|---|
| `src` | Public path, resolved against `apps/web/public` |
| `sizes` | Declared pixel dimensions — **checked against the file's IHDR** (FR-833) |
| `type` | `image/png` |
| `purpose` | `maskable` where applicable; **never `monochrome`** in this feature (FR-841) |

**Invariant (FR-832)**: expectations derive from the declarations, so a **newly declared icon with
no file fails by existing**. No allow-list is needed for anything this feature ships (FR-834).

**Second declaration site**: `apps/web/index.html`, whose `<link rel="icon">` and
`<link rel="apple-touch-icon">` hrefs the same gate parses and resolves.

---

## Derivation graph

```text
assets/brand/logo.png                     ← the only input (FR-803)
    │  extract(172,162,283,300)
    ▼
alpha matte (283×300 RGBA)                ← unmix on red; 241/255 delta
    │
    ├─► paint #0d1942 plate ─► icon-192, icon-512, icon-maskable-512,
    │                          apple-touch-icon-180, favicon-32, favicon-16
    │                                   │
    │                                   └─► favicon.ico  (16 + 32 embedded)
    │
    └─► no plate ──────────► mark-coral.png   (matte as-is)
                             mark-navy.png    (matte painted #0d1942)

built application + seeded stack ─► screenshots/   ← the one asset class NOT from the board
```

---

## State transitions

None. Every asset is static and identical for every attendee, signed in or not, at every event.
Nothing here has a lifecycle, a status, or a clock.
