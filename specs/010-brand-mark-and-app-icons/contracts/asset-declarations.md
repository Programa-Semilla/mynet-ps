# Contract: Brand asset declarations

**Feature**: 010 | **Date**: 2026-08-10

This feature exposes no HTTP endpoint and changes `contracts/openapi.json` not at all. What it does
expose are three **declaration contracts** — places where a name is written down and something else
is expected to exist. Each is machine-checked, because each is a place where a passing build can
still be wrong.

---

## Contract 1 — Icon declarations (`apps/web` ↔ the platform)

**Producer**: `apps/web/vite.config.ts`, via a shared declarations module.
**Consumer**: the platform's install machinery, at install time, on a real device.
**Enforced by**: a unit test under `apps/web/tests/unit/` (research R5).

### Shape

```jsonc
{
  "icons": [
    { "src": "/icons/icon-192.png",          "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png",          "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png",
      "purpose": "maskable" },
    { "src": "/apple-touch-icon.png",        "sizes": "180x180", "type": "image/png" }
  ],
  "screenshots": [
    { "src": "/screenshots/<name>.png", "sizes": "<w>x<h>", "type": "image/png",
      "form_factor": "narrow" | "wide" }
  ]
}
```

### Obligations

| # | Obligation | Requirement |
|---|---|---|
| C1.1 | Every declared `src` resolves to a file under `apps/web/public` | FR-832 |
| C1.2 | Every file's **actual** IHDR dimensions equal its declared `sizes` | FR-833 |
| C1.3 | Expectations are derived from the declaration list, never hard-coded | FR-832 |
| C1.4 | No allow-list is required for anything this feature ships | FR-834 |
| C1.5 | `purpose: "monochrome"` does not appear | FR-841 |
| C1.6 | The check runs in the existing correctness gates | FR-835 |

**The failure this exists to catch**: a manifest naming a file that is not there. Today that passes
typecheck, lint, unit, component, contract, migration, integration, accessibility, end-to-end **and**
the production build, and fails only when a real device tries to install.

**Why a test and not a build plugin**: screenshots are captured *from the built application*.
A build that aborted on a declared-but-missing screenshot could never produce the build that
captures it. As a test, `pnpm build` succeeds and `pnpm verify` fails.

---

## Contract 2 — Document head links (`index.html` ↔ the browser)

**Producer**: `apps/web/index.html`.
**Consumer**: every browser rendering a tab, a bookmark, a pinned tab, or an iOS home-screen icon.
**Enforced by**: the same unit test, parsing the HTML.

### Shape

```html
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

Plus `/favicon.ico` at the origin root, which is requested by path convention rather than by link
(research R9).

### Obligations

| # | Obligation | Requirement |
|---|---|---|
| C2.1 | Every linked `href` resolves to a file under `apps/web/public` | FR-832 |
| C2.2 | Declared `sizes` match the file's real dimensions | FR-833 |
| C2.3 | An `apple-touch-icon` link is present | FR-813 |
| C2.4 | At least one `rel="icon"` link is present | FR-816 |
| C2.5 | `<title>` and the description meta are unchanged | FR-819 |

**Starting state**: `index.html` today has **neither** a favicon link nor an apple-touch-icon. This
contract is created by this feature, not modified.

---

## Contract 3 — Derivation (`assets/brand/logo.png` ↔ the committed assets)

**Producer**: `scripts/generate-brand-assets.mjs`.
**Consumer**: a reviewer, and any future change of input.
**Enforced by**: determinism — regenerating on a clean checkout must produce no diff.

### Obligations

| # | Obligation | Requirement |
|---|---|---|
| C3.1 | The crop rectangle, plate colour, safe-zone inset and every output size are readable values in the script | FR-805 |
| C3.2 | The script asserts the source's dimensions and fails loudly on a mismatch | FR-807 |
| C3.3 | Regeneration is byte-identical | FR-806, SC-809 |
| C3.4 | The maskable variant fits the **80%-diameter safe circle by bounding-box diagonal** | FR-811, R1 |
| C3.5 | The apple-touch asset has zero transparent pixels | FR-812, SC-803 |
| C3.6 | In-app marks carry no plate | FR-820a |
| C3.7 | Both colourways derive from one matte | FR-820b, R2 |
| C3.8 | The brand constants carry their reasoning where they are defined | FR-809 |

**Not a lint concession.** `mynet/no-colour-literals` covers `apps/web/**` and CSS, not `scripts/`
(research R8), so C3.8 is a documentation obligation and the colour-literal count does not rise.

---

## What this feature does not touch

- **`contracts/openapi.json`** — unchanged. No route is added, changed or removed.
- **The database schema** — unchanged. No migration number is claimed.
- **Any repository interface** — unchanged. Nothing here crosses the network.
- **Any accessible name, heading or landmark** — unchanged by construction (FR-821, SC-807).
