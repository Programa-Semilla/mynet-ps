# Review Guide: Brand Mark and Application Icons

**Generated**: 2026-08-10 | **Spec**: [spec.md](spec.md)

## Why This Change

**MyNet has had no logo for the entire life of this project.** Constitution register entry 2 —
*"Real brand mark and application icons"* — is the oldest entry in the register, open since 1.0.0,
and it could never be closed from inside the repository because it needed an asset only the client
could supply. On **2026-08-10 the owner supplied a brand board**, and that supply *is* the decision
the entry was waiting for.

What stands in for it today is deliberately unusable: a navy square with a coral disc **struck
through by an amber diagonal band**. Its README explains the design — *"a tasteful placeholder is
the dangerous kind: it looks finished, so it ships and nobody notices for a year."* Meanwhile
`apps/web/index.html` has **neither a favicon link nor an apple-touch-icon**, so every browser tab
showing MyNet displays the default blank-document glyph.

## What Changes

The MyNet mark reaches every surface that identifies the product: the three PWA install icons are
replaced at their existing names and sizes, an opaque 180px apple-touch icon and a favicon set are
added along with the `<link>` tags that have never existed, the mark appears in the desktop rail,
the top bar and all five authentication screens, and the manifest gains screenshots so a rich
install prompt shows the product rather than a name. A new gate closes a hole nothing covers today:
**a manifest can currently name a file that does not exist and all ten correctness gates stay
green**, with the failure appearing only when a real device tries to install.

**No breaking change.** No design token changes value, no accessible name or heading changes, no
schema change, no migration, no route, no attendee data. The constitution amendment this carries —
**v3.4.0** — is **already ratified**, closing register entry 2 and adding standing decision 27.

## How It Works

**The whole pipeline is one idea.** The brand board has **no alpha channel**, so cropping the mark
drags the board's navy into every antialiased edge. Unmixing that composite algebraically —
`α = (P − B) / (F − B)` on the red channel, where the coral/navy delta is **241 of 255** — recovers
a clean **alpha matte** in one step. Every asset is then that matte, resampled and painted: onto an
opaque brand-navy plate for the install icons and favicons, onto transparency for the two in-app
colourways. Measured on the real 84,900-pixel crop, **98% of pixels resolve to fully opaque or fully
transparent** — the signature of a clean vector-drawn shape.

One matte painted twice is what makes the two colourways a single derivation rather than two crops
to keep in sync.

Assets are **derived by a readable script** (`scripts/generate-brand-assets.mjs`) rather than
committed as opaque binaries, preserving the convention the provisional generator established: a
reviewer verifies the crop rectangle, the plate colour and the safe-zone inset by reading code. This
also makes the later vector redraw a change of *input* to one pipeline rather than a second
mechanism.

The **existence gate** extracts the icon declarations into `apps/web/src/app/icons.ts`, shared by
`vite.config.ts` and a node-environment unit test, following the `branding.ts` precedent the config
already uses. It reads PNG dimensions straight from the IHDR header — sixteen lines, no dependency.
It is a **test rather than a build plugin** deliberately: screenshots are captured *from the built
application*, so a build that aborted on a declared-but-missing screenshot could never produce the
build that captures it.

## When It Applies

**Applies when**:

- An attendee installs MyNet to a home screen, on any platform, with any launcher mask
- Any browser renders a tab, a bookmark or a pinned tab for MyNet
- Any attendee is inside the shell at any of the three width bands, or on any of the five
  authentication screens
- Any future change declares an icon in the manifest or links one from the document head — the gate
  applies to it automatically, with no allow-list to update

**Does not apply when**:

- **iOS splash screens** (`apple-touch-startup-image`) — deferred. A full device matrix is 10–20
  images running to several megabytes, and the service worker precaches every PNG under `public/`.
  When picked up it must carry the precache exclusion with it.
- **A `purpose: "monochrome"` icon variant** — deferred. Thin platform support, narrow value.
- **A vector redraw of the mark** — deferred, and see Key Decision 2 for why its justification
  changed during planning.
- **The design token palette** — explicitly out of bounds (FR-831). See Key Decision 3.
- **The rest of roadmap phase 010 (Launch Readiness)** — the validation checklist sweep, the
  accessibility sweep, the performance pass and the physical iPhone test remain outstanding. This
  feature takes the brand gate and nothing else.

## Key Decisions

1. **The maskable safe zone is a circle, and planning corrected a defect in the spec's own
   measurement.** The spec originally stated that filling a 512px icon at the 80% safe zone is a
   **1.37× upscale**. That reading sizes the mark's *bounding box* to 80% of the **side** — which
   puts its corners **281.5px** from centre against a safe radius of **204.8px**, so an Android
   circular mask **clips both node terminals**, the defining feature of the mark. The safe zone is a
   **circle** of 80% diameter, so it is the bounding-box **diagonal** that must fit. Correct size:
   **297.9px — 0.993× of native**. Verified by rendering both and applying the mask. Consequence:
   **nothing this feature ships is upscaled.** `T013` pins the geometry so the error cannot return.

2. **The vector redraw stays booked, but its reason changed.** It was justified as rescuing
   "1.37×-upscaled" assets. Since nothing is upscaled, the honest justification is **resolution
   independence for sizes not yet asked for**. Recorded explicitly so nobody later reads a booked
   follow-up as evidence that something shipped soft.

3. **The icon carries the brand's navy `#0d1942`; the UI palette does not adopt it.** Measured, the
   brand and the tokens disagree — brand navy `#0d1942` against `navy-800 #1b2340`, brand coral
   `#fe6551` against `coral-500 #e8634d`; cream agrees. Adopting the brand values would remove the
   seam between the icon plate and the token-derived `theme_color` on the splash screen, but
   `navy-800` is the primary surface and `coral-500` is both the accent and the focus ring, so it
   repaints the entire product and re-opens every contrast ratio. **Deferred as new register entry
   22**, and the seam is a knowingly accepted interim cost.

4. **Colourway is chosen per surface, because the wrong choice is invisible rather than ugly.** The
   board supplies coral-on-navy and navy-on-cream for exactly this reason. A navy mark on the navy
   rail is *absent* while being present in the DOM, correctly sized, correctly hidden from assistive
   technology, and passing every behavioural assertion available. Verified by asserting which asset
   each surface references, plus a ≥3:1 non-text contrast check (measured headroom: 5.29:1 on the
   rail, 17.01:1 on the raised surface).

5. **The brand constants are documentation, not a lint exemption.** `mynet/no-colour-literals` is
   registered on `apps/web/**` and CSS — it does not cover `scripts/`, verified against the outgoing
   generator which declares `const NAVY = [0x1b, 0x23, 0x40]` and passes lint today. So the
   colour-literal count genuinely does not rise and **nothing is carved out**. FR-809's obligation is
   to write the reasoning where the constants live.

6. **`sharp` becomes a root devDependency, explicitly.** `.npmrc` sets `shamefully-hoist=false`, so a
   root script cannot resolve `apps/api`'s copy — verified, it fails with `ERR_MODULE_NOT_FOUND`.
   Reaching into `node_modules/.pnpm/…` is the phantom dependency that setting exists to forbid.
   **No new client dependency**: the mark is a static asset, not a bundled import.

## Areas Needing Attention

**The 320px top bar is the tightest row in the product, and this adds to it.** `TopBar`'s own source
comment already records the rule: the label, the conference switcher, the profile control and the
sign-out control share one row, and *"something has to give, and it must be a label rather than a
control."* The mark must be `shrink-0` while the label keeps `shrink truncate`, so the label yields
first. Reviewers should check this at 320px specifically, not just "on mobile". The owner chose to
put the mark here after the brainstorm left it open — it is a deliberate cost, not an oversight.

**The tablet band is an inference beyond the owner's answer, and its stated premise was wrong.**
The owner said the *mobile* top bar carries the mark; extending it to tablet was an inference the
spec flagged as reviewable. It was justified by "the rail is desktop-only (`≥1280px`)" — and that
is **false**. `TabletRail` renders `tablet:flex desktop:hidden` on `bg-surface-inverse`, live from
768px to 1279px. What is desktop-only is `DesktopRail`.

The shipped arrangement still satisfies FR-823 and FR-824, and nothing about it is broken. But the
alternative — the mark at the head of `TabletRail` in coral, mirroring `DesktopRail` exactly — was
never weighed, because the spec recorded that surface as not existing. **This is an open layout
question for the owner** and belongs with register entry 4. Found by the deep review, not by any
gate.

**Position and size are the class of defect no gate here can see.** This project's own history is the
argument: the first human to open a dialog found it rendering in the **top-left corner** after it had
passed 135 end-to-end tests, five review agents and CodeRabbit. Every assertion in this feature will
pass on a mark that is twice the size it should be. **Quickstart scenarios 5–9 are sign-off, not
polish**, and 007 and 008 both shipped with theirs outstanding.

**The 16px favicon is tight.** Research found it recognisable but soft — the node terminals merge
into the strokes. The fill fraction is the lever and `T027` is the tuning task. 32px is the size that
must be right, since that is what hidpi displays request.

**One constitution clause is softer than it reads.** The new binding block argues the plate *must* be
brand navy *because* the board's edges are blends against it. With a correctly unmixed matte the halo
does not arise at any plate colour, so the mechanical necessity is weaker than written. **The
decision is unchanged** — owner decision B3 chose brand colours on brand grounds — but a reader
should not be misled by an argument stronger in prose than in fact.

**Screenshots are committed to a public repository, permanently.** They must show seeded fixture data
only. The capture method guarantees this by construction, since the end-to-end stack contains nothing
else, but it is worth a reviewer's eyes on the actual images.

## Open Questions

- **Register entry 23 — whether `navy-800` and `coral-500` adopt the brand values.** Opened by the
  same amendment that closed entry 2. Blocks nothing; the product behaves as specified either way.
- **Register entry 4 — desktop and tablet layouts have never been validated by the client.** This
  feature **escalates** it by adding a visible element to both unreviewed bands, and the amendment
  explicitly does **not** close it. Taking it would answer a question nobody asked (Principle I).
- **Whether `favicon.ico` is worth the thirty lines.** Decided yes (research R9) — clients that guess
  the conventional path without parsing the document would otherwise 404 forever — but it is
  genuinely low value and a reviewer may reasonably disagree.

## Review Checklist

- [ ] Key decisions are justified
- [ ] Breaking changes are documented with migration guidance *(none — verify that claim)*
- [ ] Scope matches the stated boundaries
- [ ] Success criteria are achievable
- [ ] No unstated assumptions
- [ ] **The maskable icon's mark fits the 80%-diameter safe *circle*, not 80% of the side** — render
      it through a circular mask and confirm both node terminals survive
- [ ] **The apple-touch icon has zero transparent pixels** — iOS renders transparency as black
- [ ] **Each surface uses the colourway that contrasts with it** — the invisible-mark failure
- [ ] **No control is displaced at 320px** — switcher, profile and sign-out all still present
- [ ] **No accessible name, heading or landmark changed**, and the mark is not announced
- [ ] **The existence gate was proven to fail**, not merely observed to pass
- [ ] **Screenshots contain no real account's data**, and are absent from the precache set
- [ ] **Quickstart scenarios 5–9 were walked by a person** — and if not, that is stated in the PR
      rather than left to lapse

---

<!-- Code phase sections are appended below this line by the phase-manager command -->
