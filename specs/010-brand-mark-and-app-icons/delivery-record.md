# 010 — delivery record

**Feature**: Brand mark and application icons | **Delivered**: 2026-08-10 | **Requirement**: T071

This file exists to say, honestly, **what was actually checked and what was not**. 007 and 008 both
shipped with their by-hand walkthrough outstanding and neither said so anywhere a reader would find
it; 008's is how a dialog rendering in the top-left corner was discovered after passing 135
end-to-end tests, five review agents and CodeRabbit.

---

## Quickstart scenarios: what was walked

| # | Scenario | Walked? | By what |
|---|---|---|---|
| 1 | The pipeline is deterministic | ✅ **Yes** | Regenerated on a clean tree; `git diff` over `apps/web/public/` is empty. Also proved the loud failure: an 800×600 substitute made the script name what it expected, write nothing, and exit 1 |
| 2 | A declared icon with no file fails | ✅ **Yes** | Removed `icon-192.png` → failure naming the declaration, the expected path and the fix. Pointed a 192 declaration at the 512 file → failure naming both dimensions. Both restored |
| 3 | Nothing else regressed | ✅ **Yes** | Full `pnpm verify`; `pnpm test:a11y` 28/28 unchanged; no design token changed value |
| 4 | Screenshots stay out of the install download | ✅ **Yes** | Built, then read `dist/sw.js`: **zero** `screenshots/` entries, all four icons present. Pinned as a test |
| 5 | **Install it and look at it** | ❌ **NO** | Needs a phone. Nobody has installed this build |
| 6 | **The tab strip** | ⚠️ **Partly** | The favicons were rendered and compared by eye against the board's own 32/24/16 scale tests — 32px clean, 16px legible but soft, as research R4 predicted. **Not** viewed in a real browser tab strip, bookmark bar or pinned tab |
| 7 | **The mark in the shell, at all three widths** | ⚠️ **Partly** | Rendered and looked at in a real browser at 390px and 1280px (the six committed screenshots). Measured at 320/360/375/414/600/767/768/834/1024/1279/1280/1440/1920. **Not** reviewed by the owner, which is the half that matters — see register entry 4 |
| 8 | **The five authentication screens** | ⚠️ **Partly** | Asserted structurally: one mark each, navy colourway, every `<h1>` unchanged, no overflow at thirteen widths. **Not** looked at |
| 9 | **Screen reader** | ❌ **NO** | Asserted (`role="img"` count zero, `alt=""`, `aria-hidden="true"`, axe clean) but **no screen reader was run** |
| 10 | Offline | ✅ **Yes** | Icons precache with the shell; screenshots deliberately do not. Confirmed in the built worker |

**Scenarios 5 and 9 were not done at all. 6, 7 and 8 were done by rendering, not by using.**

---

## What the automated gates cover, and what they cannot

Green: typecheck, lint, format, unit (450), component (539), contract, integration, build, asset
budget, end-to-end (139), accessibility (28).

**None of them can see whether the mark looks right.** They assert which asset each surface
references, that exactly one mark is visible per width band, that no control is displaced at 320px,
that contrast clears 3:1, and that every declared icon exists at its declared size. A mark that is
present, correct, and *twice too large* passes all of it.

---

## Findings from the first human look

### 1. The mobile top bar truncates the product name — and did so before this feature

Rendering Home at 390px shows the top bar reading **"M…"** rather than "MyNet".

Measured, at every mobile width, with and without the mark:

| Viewport | Label needs | Has, **without** the mark | Has, with the mark | Mark's cost |
|---|---|---|---|---|
| 320px | 60px | 43px | 30px | 13px |
| 360px | 60px | 49px | 38px | 11px |
| 390px | 60px | 54px | 45px | 9px |
| 414px | 60px | 58px | 50px | 8px |

**The label was already truncated at every one of these widths before 010 existed.** The mark takes
a further 8–13px and makes an existing defect more visible; it did not create it.

FR-825 is satisfied — the label yields and the conference switcher, profile control and sign-out
control are all untouched, which is the rule `TopBar`'s own source comment sets. So this was
**recorded rather than fixed**: redesigning the mobile top bar is a layout decision in **register
entry 4** territory and belongs to the owner, not to a feature whose scope is the brand mark.

**Worth deciding**: at mobile the mark now carries the product identity, so a truncated "M…" beside
it is arguably redundant clutter rather than useful text. Options are to drop the visible label at
mobile (keeping it for assistive technology), to give it more room by shrinking the switcher, or to
leave it. All three are design calls.

### 2. Two flaky test failures, neither reproducible, neither in this feature's code

Recorded because a flake that nobody writes down gets rediscovered as a defect.

- **`apps/web/tests/home-cards.test.tsx`** — "rest-of-day renders a DIFFERENT body in each of the
  four states" failed once under full-suite load: the `failed` state still showed the loading body,
  so 3 distinct bodies were seen instead of 4. Passed in isolation and in **three** subsequent full
  component runs (539 tests each). The same suite at `HEAD` also passed.
- **`e2e/messages-journey.spec.ts`** — FR-503a, "opening a thread and leaving without sending leaves
  no trace", failed once: Grace's conversation count read 0 where 1 was expected. Passed on a
  targeted re-run and on a **full 139-test re-run**.

Both look like async-settlement races in shared state. Neither touches brand assets, the manifest,
or any file 010 changed. **Not investigated further** — out of scope here, and worth a look by
whoever next works on Messages or Home.

---

## Recommended before merge

Fifteen minutes with a phone and a browser closes scenarios 5–9. There is nothing here that needs a
specialist:

1. Install it on a phone and look at the home-screen icon (5).
2. Launch it and confirm the splash shows the **accepted** navy seam and nothing else (5).
3. Look at a real tab, a bookmark and a pinned tab (6).
4. Look at the shell at a phone width, a tablet width and a desktop width (7).
5. Visit the five authentication screens (8).
6. Turn on VoiceOver or NVDA and confirm the mark is silent (9).
