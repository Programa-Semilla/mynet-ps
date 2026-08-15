# 010 — booked follow-ups

**Feature**: Brand mark and application icons | **Booked**: 2026-08-10 | **Requirement**: T063a

Three pieces of work were deliberately left out of 010's core scope. They are recorded here as
named items rather than as sentences inside a design document, because **a note in prose is how
deferred work stops existing**. Each says what it is, why it was deferred, and what it costs to
leave undone.

None of them blocks anything. 010 ships a complete brand mark on every surface the product has.

---

## 1. The iOS `apple-touch-startup-image` splash matrix

**Requirement**: FR-840 | **Priority**: low, and rises only if iOS installation becomes a stated goal

**What it is.** iOS does not generate a launch image for an installed web application the way
Android does. Without `apple-touch-startup-image` links, launching MyNet from an iOS home screen
shows a blank white screen until the shell paints. Covering it properly means one image per device
resolution and orientation — a matrix of roughly twenty files, each of which must be regenerated
whenever Apple ships a new screen size.

**Why it was deferred.** It is the single largest asset family the product could acquire, it is
device-specific rather than brand-specific, and its whole benefit is a fraction of a second at
launch on one platform. 010's scope was the mark itself.

**The trap, if it is ever taken up.** These images **must** carry the precache exclusion with
them. They are large and numerous, and `injectManifest.globIgnores` currently names only
`'**/*.map'` and `'screenshots/**'` — adding twenty full-resolution splash images without a third
entry would put several megabytes into every attendee's install download, on every platform,
to serve a launch transition on one.

---

## 2. A `purpose: "monochrome"` icon variant

**Requirement**: FR-841 | **Priority**: low

**What it is.** A single-colour version of the mark that the platform may tint — used by Android's
themed icons and by some notification surfaces.

**Why it was deferred.** The board carries a monochrome test, so the design intent exists. What
does not exist is a purpose-drawn *asset*: a monochrome icon is not the coloured one desaturated,
because the mark's node terminals read against the plate by colour as much as by shape.

**Why declaring it early would be worse than not having it.** `purpose: "monochrome"` is a promise
that the platform may recolour this image freely. Declaring it against an asset that was not drawn
for it hands over arbitrary recolouring of the brand mark. `apps/web/tests/unit/icon-declarations.test.ts`
asserts the purpose does not appear, so taking this up means deleting that assertion — which is
the conversation.

---

## 3. A vector redraw of the mark

**Requirement**: FR-842 | **Priority**: low

**What it is.** An SVG source for the mark, replacing the raster crop from the brand board as the
pipeline's input.

**Why it was deferred.** It needs either the designer's original artwork or a careful redraw, and
neither was available when 010 was built.

**Its reason is future flexibility, and NOT present degradation — this is the part most likely to
be misremembered.** The specification originally argued the redraw was urgent because filling a
512px maskable icon from a 300px master meant a 1.37× upscale, and that the two 512s were
therefore degraded. **That was wrong.** The maskable safe zone is a circle of 80% diameter, so the
largest mark that fits a 512px icon is 297.9px — a 0.993× scale. Planning measured it, corrected
the spec, and pinned the correction in `scripts/generate-brand-assets.test.mjs`.

So nothing 010 ships is upscaled, and nothing is waiting to be rescued. What a vector source buys
is: any size added later at any resolution, a natural input for the monochrome variant above, and
a diff that a human can read when the mark itself changes.

**When it happens it is a change of input to one pipeline**, not a second pipeline — which is
precisely what the "derived by a readable script" convention was adopted to guarantee.
