# Quickstart: Brand Mark and Application Icons

**Feature**: 010 | **Date**: 2026-08-10

Validation for this feature is **unusually weighted toward looking at things**, and that is the
point rather than a shortcoming. A brand mark's defects — wrong colourway, wrong size, wrong
position, illegible at 16px — are invisible to every automated gate this project has. Scenarios 1–4
are machine-checkable. **Scenarios 5–8 are not, and they are the ones that matter most.**

Read `research.md` R1 before validating the maskable icon. The obvious reading of "80% safe zone" is
wrong and produces a clipped mark.

## Prerequisites

```bash
pnpm install                 # picks up sharp as a new root devDependency (R7)
node scripts/generate-brand-assets.mjs
```

---

## Scenario 1 — The pipeline is deterministic (FR-806, SC-809)

```bash
node scripts/generate-brand-assets.mjs
git status --short apps/web/public/
```

**Expected**: no output. Regenerating on a clean checkout produces byte-identical assets.

Then break it deliberately:

```bash
mv assets/brand/logo.png /tmp/ && node scripts/generate-brand-assets.mjs; mv /tmp/logo.png assets/brand/
```

**Expected**: a loud failure naming the missing source (FR-807) — **not** a silent success and
**not** a plausible-looking asset.

---

## Scenario 2 — A declared icon with no file fails (FR-832, FR-833, SC-810)

This is the gate that does not exist today. Prove it fails before trusting that it passes.

```bash
pnpm test:unit                                    # baseline: green
mv apps/web/public/icons/icon-192.png /tmp/
pnpm test:unit                                    # expect FAILURE naming the declaration and the path
mv /tmp/icon-192.png apps/web/public/icons/
```

Then prove the dimension half:

```bash
cp apps/web/public/icons/icon-512.png apps/web/public/icons/icon-192.png
pnpm test:unit                                    # expect FAILURE: declared 192x192, actual 512x512
git checkout apps/web/public/icons/icon-192.png
```

**Expected**: both failures. A test that only ever passes is the "gate that does not fail when
broken" this project has failed on before.

---

## Scenario 3 — Nothing else regressed (SC-807, SC-811, SC-812)

```bash
pnpm verify
```

**Expected**: green throughout. Specifically:

- `pnpm lint` — the colour-literal count has not risen (the brand constants live in `scripts/`,
  which the rule does not cover — research R8).
- `pnpm test:component` — every existing assertion about headings, labels and landmarks still
  passes. Nothing a screen reader reads has changed.
- `pnpm budget` — the shell JavaScript is unmoved. The mark is a static asset, not a bundled import.

---

## Scenario 4 — Screenshots stay out of the install download (FR-815d)

```bash
pnpm --filter @mynet/web build
grep -c "screenshots/" apps/web/dist/sw.js
```

**Expected**: `0`. The screenshots are served, declared in the manifest, and **not** precached.
Confirm the icons *are*:

```bash
grep -c "icons/icon-512" apps/web/dist/sw.js     # expect 1
```

---

## Scenario 5 — Install it and look at it (FR-810–FR-812, SC-801, SC-802, SC-803)

**By hand. No test substitutes for this.**

1. `pnpm start`, then install the application from the browser's install affordance.
2. Look at the home-screen icon. **Expected**: the MyNet mark on the brand navy plate, no diagonal
   band anywhere.
3. **Android or a launcher applying a circular mask**: both node terminals survive the crop. This is
   the specific failure R1 caught — the terminals are the first thing a circle mask takes.
4. **iOS**: the icon is opaque. Any black square means the apple-touch asset carried transparency.
5. Launch from the home screen and watch the splash. **Expected**: the known navy seam between the
   icon plate (`#0d1942`) and `theme_color` (`navy-800 #1b2340`) — *and nothing else*. That seam is
   accepted (register entry 23); anything else is a defect.

---

## Scenario 6 — The tab strip (FR-816–FR-818a, SC-804)

**By hand.**

1. Open MyNet alongside a dozen other tabs. **Expected**: the mark, not the default document glyph.
2. Narrow the window until tabs collapse to favicons. **Expected**: MyNet is still findable.
3. Bookmark it and pin it. **Expected**: the same mark in both.
4. **The judgement FR-818a assigns to a human**: does it read as the MyNet "N" at 16px? Compare
   against the board's own 16px scale test. Research R4 found this tight — recognisable but soft, and
   the fill fraction is the lever. **If it does not read, tune and regenerate; do not accept it.**

---

## Scenario 7 — The mark in the shell, at all three widths (FR-822–FR-827, SC-805, SC-806, SC-814)

**By hand, and this is where register entry 4 lives.**

| Width | Expected |
|---|---|
| 320px | Mark in the compact header beside the product name, **navy** on the light surface. Conference switcher, profile control and sign-out control **all still present and unmoved**. No horizontal scrolling. |
| Tablet | Mark in the top bar beside the **destination** name. This band had no brand presence at all before. |
| Desktop (≥1280) | Mark in the rail, **coral** on the inverse surface. **No second mark in the top bar.** |

Then the one that no assertion catches: **is it the right size, and is it in the right place?** The
project's own history is the argument for looking — the first human to open a dialog found it
rendering in the top-left corner after it had passed 135 end-to-end tests, five review agents and
CodeRabbit.

Check the colourway swap explicitly: a navy mark on the navy rail is **invisible while present**,
correctly sized, correctly hidden from assistive technology, and passing everything.

---

## Scenario 8 — The five authentication screens (FR-826, SC-808)

**By hand.** Visit each: sign-in, sign-up, verify, reset-request, reset-password.

**Expected**: the mark centred **above** the existing heading, in the stacked arrangement, on all
five. Remember that three of them carry no product name at all today — on those the mark is
introducing brand presence, not joining a wordmark.

**Expected unchanged**: every heading's text. `Verify your email address`, `Reset your password` and
`Set a new password` are still the `<h1>`.

---

## Scenario 9 — Screen reader (FR-821, SC-807)

Traverse the shell and one authentication screen with a screen reader.

**Expected**: the mark is **not announced**. The product name, the destination name and every heading
are announced exactly as before. If the mark speaks, it has an accessible name it should not have.

---

## Scenario 10 — Offline (Principle VI declaration)

1. Load the application, then go offline.
2. Navigate between destinations.

**Expected**: the mark renders throughout — it is precached with the shell. Nothing about brand
assets changes any offline behaviour, because none of them crosses the network at runtime.

---

## Sign-off

This feature is not complete until scenarios **5 through 9** have been walked by a person. 007 and
008 both shipped with their by-hand walkthrough outstanding, and 008's is how the top-left dialog
was found. For a feature whose entire deliverable is visual, skipping them would leave nothing
verified at all.
