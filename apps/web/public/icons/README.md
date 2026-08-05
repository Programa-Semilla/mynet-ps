# Application icons — PROVISIONAL, NOT BRANDING

**None of the files in this directory is approved branding. They exist so that the manifest
validates and the application is installable (FR-050), and for no other reason.**

MyNet has no logo. A real brand mark and application icons are an open **client decision** — see
`CLAUDE.md` → "Open questions and known discrepancies", and the constitution's register. Drawing
a mark here would quietly answer a question nobody asked us to answer, which Principle I forbids.

## What they are

A navy square with a coral disc, struck through by an amber diagonal band.

The band is deliberate. A tasteful placeholder is the dangerous kind: it looks finished, so it
ships and nobody notices for a year. This one cannot be mistaken for a decision.

| File                    | Size    | Purpose                                                                        |
| ----------------------- | ------- | ------------------------------------------------------------------------------ |
| `icon-192.png`          | 192×192 | Home screen, standard density                                                  |
| `icon-512.png`          | 512×512 | Splash screen and store listings                                               |
| `icon-maskable-512.png` | 512×512 | `purpose: maskable` — mark kept inside the 80% safe zone platforms may crop to |

## How they are made

Generated from the design tokens, not committed as opaque binaries:

```bash
node scripts/generate-provisional-icons.mjs
```

The script is forty lines of PNG encoding with no dependencies. A reviewer can see exactly what
these contain by reading it, rather than by opening a binary and trusting it.

## Replacing them

When the client supplies a mark:

1. Replace the three files with real exports at the same names and sizes.
2. Delete `scripts/generate-provisional-icons.mjs`.
3. Delete this file, or rewrite it to record the source of the real assets.
4. Check `background_color` and `theme_color` in the manifest (`apps/web/vite.config.ts`) still
   suit the new mark — they are currently cream-100 and navy-800 from the token file.

Until then, treat any screenshot containing these icons as a screenshot of unfinished work.
