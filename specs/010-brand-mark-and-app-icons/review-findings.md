# Deep Review Findings

**Date:** 2026-08-10
**Branch:** `docs/brand-mark-and-app-icons`
**Rounds:** 1
**Gate Outcome:** PASS (with one finding escalated to the owner rather than fixed)
**Invocation:** manual (`/speckit-spex-deep-review-run`)

## Summary

| Severity | Found | Fixed | Escalated | Recorded, not fixed |
|----------|------:|------:|----------:|--------------------:|
| Important | 8 | 7 | 1 | 0 |
| Minor | 19 | 15 | 0 | 4 |
| Notable | 4 | — | — | 4 |
| **Total** | **31** | **22** | **1** | **8** |

**Agents completed:** 5/5. **External tools:** CodeRabbit and Copilot both skipped — CLI not
installed.

| Agent | Found | Fixed | Remaining |
|---|---:|---:|---:|
| Correctness | 5 | 4 | 1 (Notable) |
| Architecture & Idioms | 10 | 8 | 2 (Notable) |
| Security | 3 | 2 | 1 (Notable) |
| Production Readiness | 7 | 4 | 3 (2 recorded, 1 Notable) |
| Test Quality | 12 | 10 | 2 (recorded) |

**MVP: Test Quality (12 findings)** — and it earned it by reading assertions rather than test
names, which is how the never-running precache gate was caught three times over.

**Three agents independently found the same defect** (Correctness F1, Production F2, Test F1): the
only assertion for FR-815d was guarded by `it.skipIf(!existsSync('dist/sw.js'))` and could not run.
Independent convergence is the strongest signal in this whole review.

---

## Findings that changed the code

### FINDING-1 — The precache gate could never run (Critical in effect, filed Important)

**Confidence:** 93 · **Source:** test-quality, correctness, production-readiness (three agents)
**File:** `apps/web/tests/unit/icon-declarations.test.ts:202-215` · **Resolution:** fixed

**What was wrong.** The single automated check for FR-815d/SC-815 — screenshots declared but not
precached — read `apps/web/dist/sw.js` behind `it.skipIf(!existsSync(worker))`. CI's `test-unit`
job is checkout → install → `pnpm test:unit` with no build, so `dist/` never exists and the case
skipped on **every** CI run. Locally it was worse than absent: `pnpm verify` orders `test:unit`
*before* `build`, so it either skipped or asserted against a **stale** worker from an earlier build.

**Why it matters.** This is the feature whose entire thesis is that a check which did not execute
has not passed, carrying a gate that never executed. 436KB of screenshots could have entered every
install download with nothing objecting. The test's own comment claimed a developer "gets the note
rather than a false pass" — `skipIf` prints no note.

**How it was resolved.** Moved to `scripts/brand-audit.mjs`, which runs in `pnpm verify` right
after `pnpm build` and as its own CI step in the `build` job. A missing worker is now a **failure**,
not a skip. Both failure paths were provoked and confirmed.

### FINDING-2 — `icon-512.png` was upscaled, contradicting a claim made in five places

**Confidence:** 95 · **Source:** correctness · **File:** `scripts/generate-brand-assets.mjs:102`
**Resolution:** fixed

**What was wrong.** `STANDARD_FILL = 0.62` put the mark **317px** tall in the 512 icon, drawn from
a 300px master — a 1.06× upscale. Measured on the committed artifact: alpha bounding box 299×317.

**Why it matters.** The spec, the icons README, `CLAUDE.md`, the commit message and FR-842's
justification all state that nothing in this feature is upscaled — FR-842 explicitly so, "recorded
this way so that nobody later reads a booked follow-up as evidence that something shipped soft."
One asset quietly contradicting that is how the whole record stops being trustworthy.

**How it was resolved.** `STANDARD_FILL` → `0.58` (512 × 0.58 = 296.9px, under the master), rather
than weakening the claim. All nine assets re-measured at or below 300px, and a new test asserts it
against the shipped files so it cannot regress.

### FINDING-3 — The in-app mark was upscaled 1.25× on the phones most attendees hold

**Confidence:** 82 · **Source:** production-readiness · **File:** `scripts/generate-brand-assets.mjs:115`
**Resolution:** fixed

**What was wrong.** The asset was 96px tall; the five authentication screens render it at `h-10` =
40 CSS px, which a 3× display draws from **120** device pixels. The most prominent placement of the
mark in the product was upscaled on current flagship phones — while the component's own comment
said it "stays crisp on the hidpi displays this product's attendees are using".

**How it was resolved.** `IN_APP_MARK_HEIGHT` → 160 (covers 4× at `h-10`, still under the 300px
master). `BrandMark.INTRINSIC` updated to 151×160, and a test now asserts the two agree.

### FINDING-4 — The screenshot half of the feature could be deleted with every gate green

**Confidence:** 86 · **Source:** test-quality, architecture · **Resolution:** fixed

**What was wrong.** `describe('the gate can fail')` floored `ICONS` and `iconLinks` but not
`SCREENSHOTS`. With an empty array: `declared` shrinks, `vite.config.ts`'s
`...(SCREENSHOTS.length > 0 ? …)` silently omits the manifest key, and the precache check — which
asserts an *absence* — passes trivially. Three gates, all vacuous, no complaint.

**How it was resolved.** Floor added (`>= 2`, both form factors), the conditional spread removed so
`screenshots` is declared unconditionally, and the built manifest is checked in `brand-audit.mjs`.

### FINDING-5 — The marquee geometric claim was asserted only over pure functions

**Confidence:** 85 · **Source:** test-quality · **Resolution:** fixed

SC-802/FR-811 — the safe-zone constraint this feature's research exists around — was asserted only
against `maskableMarkHeight`, `cornerDistance` and `safeRadius`. **No test read the shipped PNG.**
A regression in `main()` sizing the maskable file with `STANDARD_FILL` would pass the geometry
suite, the declaration gate, the component suite and e2e, and fail only on a real Android launcher.
FR-809 (the plate is brand navy) was likewise asserted against no artifact.

**Resolved:** the shipped maskable icon's furthest non-plate pixel is now measured against the safe
radius; the plate colour is asserted on all six plate assets; FR-818's resampling filter is asserted
by intermediate-value density in the shipped favicon.

### FINDING-6 — Determinism and the loud-failure guard had no gate at all

**Confidence:** 82 · **Source:** test-quality · **Resolution:** fixed

FR-806/SC-809 (regeneration is byte-identical) and FR-803 (no asset hand-edited) existed only as
quickstart scenario 1 — by hand, in a project that skipped its by-hand walkthrough twice running.
FR-807's loud failure was untested because `readBoard` was not exported.

**Resolved:** `buildAssets()` was split from `main()` so `brand-audit.mjs` can compare generated
bytes against disk without overwriting the evidence; `assertBoardDimensions` was exported and is
now tested directly.

### FINDING-7 — 79KB precached to answer requests that never arrive

**Confidence:** 78 · **Source:** production-readiness · **Resolution:** fixed, by a different
mechanism than proposed

Manifest icons and favicons are fetched by the **browser process**, so those requests never reach
the service worker and can never be served from its cache.

**The proposed fix did not work, and the reason is worth recording.** Adding `icons/**` to
`globIgnores` leaves all four icons in the precache: `vite-plugin-pwa` appends manifest-declared
icons *after* the glob runs. Verified by building with the pattern in place and grepping the worker.
The option that governs them is `includeManifestIcons: false`.

**Result:** precache 35 entries / 805KB → **24 entries / 715.85 KiB**. The two in-app marks stay,
because the shell renders them offline.

### FINDING-8 — The spec's tablet rationale was factually wrong → **ESCALATED**

**Confidence:** 88 · **Source:** architecture · **Resolution:** spec corrected, decision escalated

The spec justified putting the mark in the tablet top bar with "the rail is desktop-only
(`≥1280px`), so the tablet band has no brand presence anywhere". **A rail does exist there** —
`TabletRail`, `tablet:flex desktop:hidden`, on `bg-surface-inverse`, live 768–1279px. FR-823's
predicate ("the bands where no rail is present") contradicted its own enumeration.

The shipped arrangement still satisfies FR-823 and FR-824 and nothing is broken. But the
alternative — mark at the head of `TabletRail` in coral, mirroring `DesktopRail` — was never
weighed, because the spec said that surface did not exist. **Corrected in spec.md and REVIEWERS.md;
the arrangement itself is an owner question under register entry 4.**

### Smaller fixes applied

| # | Finding | File |
|---|---|---|
| 9 | `it.skipIf` aside, the gate's *failure path* had never been executed automatically — extracted `checkDeclaration` and demonstrated both failures | `icon-declarations.test.ts` |
| 10 | Link parser matched inside HTML comments and only double quotes; a link it cannot read was silently dropped | `icon-declarations.test.ts` |
| 11 | `purpose === ('monochrome' as unknown)` — an unsatisfiable predicate whose cast existed only to silence the compiler | `icon-declarations.test.ts` |
| 12 | `BrandMark.INTRINSIC` was a hand-copied duplicate of generated geometry with nothing checking it | `BrandMark.tsx`, `icon-declarations.test.ts` |
| 13 | Contrast test read palette tokens (`navy-800`) not the semantic ones the components paint (`surface-inverse`) | `brand-mark-contrast.test.ts` |
| 14 | "REJECTS each colourway on the other's surface" passed for the wrong reason — coral on white is 2.92:1, visible, not invisible | `brand-mark-contrast.test.ts` |
| 15 | Brand constants in the test could drift from the shipped pixels; now bounded against the artifact | `generate-brand-assets.test.mjs` |
| 16 | FR-826's *arrangement* (mark above the heading) was unasserted at every layer | `brand-mark.test.tsx` |
| 17 | `CAPTURE_SCREENSHOTS` branched on truthiness — `=0` or `=false` would replace the whole e2e suite | `playwright.config.ts` |
| 18 | The documented capture command does not work (`testMatch` narrows, a positional filter cannot override it) | `capture-screenshots.ts` |
| 19 | Alpha stride came from `metadata()` (the file) rather than `info` (the decoded buffer) | `generate-brand-assets.mjs` |
| 20 | `bare()` existed only to transpose two arguments of `resampled()`, in untyped `.mjs` | `generate-brand-assets.mjs` |
| 21 | Four of eight exports had no importer | `generate-brand-assets.mjs` |
| 22 | `TopBar` cited FR-822, which is the *desktop rail's* requirement | `TopBar.tsx` |

---

## Escalated to the owner

### E1 — Ancillary metadata on the brand board

**Confidence:** 92 · **Source:** security · **File:** `assets/brand/logo.png` · **Resolution:** fixed

The committed board carried a 29,087-byte ancillary PNG chunk of embedded metadata that no part of
this change had read. Derived assets were never affected — `sharp` strips ancillary chunks, and
every generated PNG carries only `IHDR`/`pHYs`/`IDAT`/`IEND`.

**Resolved before the branch was pushed:** the board was re-encoded with pixel data only. The
decoded pixels are bit-for-bit identical, so the crop coordinates, the measured brand constants and
all nine derived assets are unchanged and the brand audit still passes.

### E2 — The mobile top bar truncates the product name to "M…"

Carried over from the delivery record and unchanged by this review. Measured: the label needs 60px
and has 43–58px **without the mark at all**, so the truncation pre-dates this feature; the mark
takes a further 8–13px. FR-825 is satisfied (the label yields, no control moves). Fixing it means
redesigning the mobile top bar, which is register entry 4's territory.

---

## Recorded, not fixed

| Finding | Why not | Severity |
|---|---|---|
| **Caddy sets no `Cache-Control` for the 15 new unhashed static paths** — a rebrand could stick in heuristic caches on devices | Real, and out of this feature's scope: `deploy/vm/Caddyfile` is deployment configuration, and nothing is deployed yet. Belongs with the first deploy. | Minor |
| **Narrow screenshots are captured at 1× and look soft on the 2–3× phones the install prompt targets** | A genuine trade: fixing it roughly triples 436KB in a public repository for a better install prompt. Owner's call on repo weight. | Minor |
| **Palette PNG encoding would save ~25KB across the icon set** | Now largely moot — those icons left the install download entirely (FINDING-7). Also risks FR-806: libimagequant output is not guaranteed stable across `sharp` versions, which would make the lockfile load-bearing for determinism. | Notable |
| **The five auth screens duplicate the stacked lockup verbatim, and the `mb-*` wrappers have already drifted** (`mb-6`, `mb-6`, `mb-4`, `mb-2`, `mb-4`) | Follows an existing pattern — the five screens already duplicate their card chrome — so extracting an `AuthCard` is a refactor of 004's code, not of 010's. Worth doing; not here. | Notable |

Two Notable observations from the security and architecture agents are worth keeping in view: the
FR-815e screenshot guarantee is load-bearing on `global-setup` re-seeding unconditionally before
every capture (a "reuse the existing database" shortcut would silently turn the capture tool into a
mechanism for publishing real attendee data), and `data-brand-mark` was checked and confirmed as
*established* practice here (`data-nav-layout`, `data-card`), not test-coupling leaking into
production.

---

## Verification after fixes

`pnpm verify` — **exit 0**. Unit 457, component 544, integration 830, e2e 139, accessibility 28.
`brand-audit` passes: 9 assets byte-identical to the pipeline, precache excludes screenshots and
install icons, manifest matches the declarations.

**No spec requirement was dropped.** The fix loop removed code (`bare()`, four exports, the skipped
test), so coverage was re-checked: every FR the removed code served is now covered by a *stronger*
check than before — FR-806, FR-807, FR-809, FR-811, FR-815d, FR-818 and FR-820a/b moved from
untested or unrunnable to asserted against shipped artifacts.

**Test suite flakiness, unrelated to this feature and now at four occurrences across seven full
runs:** `home-cards.test.tsx` (once), `messages-journey.spec.ts` FR-503a (once), and
`durability.spec.ts` "survives redeployment of the API" (**twice**). None reproducible; all in
shared-state areas this feature does not touch. `durability` recurring makes it the one worth
investigating first.
