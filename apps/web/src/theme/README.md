# Theme

Everything visual that is allowed to be a literal lives in this directory.

## `tokens.css` — the only place colours exist

FR-008 requires colours, typography, spacing, and radii to be named tokens in one place.
SC-009 requires the count of colour literals **outside** this file to be zero, and
`mynet/no-colour-literals` (in `packages/config/eslint.config.js`) enforces it. `tokens.css`
is the single entry in that rule's `allow` list.

Adding a colour to `tokens.css` is a design decision. Writing one anywhere else fails `pnpm lint`.

Feature code should prefer the **semantic aliases** (`--color-surface`, `--color-text-body`,
`--color-accent`, …) over the raw scales (`--color-navy-800`). A palette revision then stays a
change to this file rather than a search across components.

## Icons — `lucide-react`, and nothing else

**FR-010: a single consistent icon set. Hand-inlined one-off SVG is prohibited** except for
genuinely bespoke marks (constitution, Technology and Architecture Constraints).

```tsx
import { Calendar, MessageSquare, Users } from 'lucide-react'

;<Calendar aria-hidden="true" focusable="false" />
```

This is a correction, not a preference. The approved prototype hand-inlined every icon as raw
SVG _while_ carrying both `lucide-react` and MUI icons as unused dependencies — `CLAUDE.md`
records that as a prototype artifact to re-decide, and research.md D13 re-decided it.

Two rules when using an icon:

- **Decorative icons take `aria-hidden="true"`.** An icon beside a text label is decorative;
  announcing it duplicates the label.
- **An icon that _is_ the control needs an accessible name** on the control — `aria-label` on
  the button, not on the `<svg>`. Every interactive control has an accessible label (FR-021),
  and an icon-only button with no label is the most common way that requirement breaks.

Lucide is tree-shakeable, so importing named icons costs only what is used — which matters
against the 200 KB gzipped shell budget (FR-072, research.md D18).

## Fonts — declared, not yet vendored

`--font-display` (Outfit) and `--font-body` (Geist) are the prototype's pairing, carried
forward as approved visual direction. **The font files are not vendored in this repository
yet**, so the fallback stack is what actually renders today.

This is deliberate rather than an oversight:

- Loading them from a third-party CDN would add a network dependency to the offline shell
  (FR-051) and put a request outside the abstraction boundary Principle V draws.
- Self-hosting is the right answer, and it is a **branding** task: constitution Open Question 2
  (real brand mark and application icons) is unresolved, and typography belongs with it.

Until that decision lands, the layout must hold on the fallback stack. If a design depends on
Outfit's exact metrics to avoid breaking, that dependency is a defect at this stage.

## Breakpoints

Defined in `tokens.css` as half-open intervals (FR-019, research.md D16), so exactly one
layout matches any width:

| Layout  | Range                    | How to write it                        |
| ------- | ------------------------ | -------------------------------------- |
| Mobile  | `width < 768px`          | unprefixed — these are the base styles |
| Tablet  | `768px ≤ width < 1280px` | `tablet:max-desktop:`                  |
| Desktop | `width ≥ 1280px`         | `desktop:`                             |

Mobile is the base layer, so a style with no breakpoint prefix applies everywhere unless a
wider band overrides it. **320px is the minimum supported width** (FR-020) — it is not a
breakpoint, because no layout switches there; it is the floor at which the mobile layout must
already work without horizontal scrolling. `e2e/responsive.spec.ts` asserts that.
