# Phase 0 Research — 016

**Date**: 2026-08-12
**Spec**: [spec.md](./spec.md)

Six questions. **Two of them change the shape of the feature**, and neither was visible from the
specification: install detection needs an **eighth device capability** and therefore a constitution
amendment, and the password reveal control has **nowhere to live** that both products can reach.

---

## R1 — How does a mutual card exchange write both records atomically?

**Decision**: `getDb().transaction(async (tx) => …)`, with the query function taking the executor as
a parameter.

**Rationale**: Both halves already exist in this codebase and neither needs inventing.
`apps/api/src/db/queries/account.ts:834` opens `getDb().transaction(async (tx) => …)` for account
deletion, which is the largest multi-statement write in the product. `admin-audit.ts:65` establishes
the parameter shape and states why: *"Callers pass their transaction when they have one, and every
write path does."*

The current share issues its statements against `getDb()` directly, where **each statement
autocommits**. FR-1022 therefore cannot be met by adding a second statement beside the first — the
first would already be committed when the second failed. This is the same trap 013 recorded for the
Q&A withdrawal lock, where a `SELECT … FOR UPDATE` handed the pool released its lock immediately.

**Alternatives considered**:
- *A single `INSERT … SELECT` writing two rows.* Attractive because it is one statement and therefore
  atomic for free. Rejected: the existing insert carries a `WHERE EXISTS` guard checking
  discoverability, verification and both registrations, and the reciprocal row needs the *same* guard
  evaluated once rather than twice. Expressing that as one statement produces a query nobody can read,
  and FR-1053 makes the guard load-bearing for the amendment itself.
- *Two statements with compensating delete on failure.* Rejected outright: a compensation that itself
  fails leaves exactly the half-written state FR-1022 forbids.

---

## R2 — How does the client detect that it is installed?

**Decision**: **An eighth device capability behind a new interface**, and a **constitution amendment
listing it**, following `VisibilityService`'s precedent exactly.

**Rationale**: This is the finding that changes US5's cost, and it was invisible from the spec.

Detection requires `window.matchMedia('(display-mode: standalone)')` and a `beforeinstallprompt`
listener on `window`. Principle V forbids feature code calling platform APIs directly, and the
`mynet/no-direct-platform-access` lint rule **enforces it mechanically**: `matchMedia` and `window`
are both in the rule's `DOM` set (`packages/config/eslint-plugin-mynet.js`), added after the rule was
found reporting zero violations because its detector was too narrow — *"the gate that passes while not
checking"*. Feature code calling `matchMedia` fails lint today.

Principle V's own text licenses the addition: *"Any new capability that touches a device, platform, or
network surface MUST be introduced behind an interface in the same change that introduces it."* What
it does **not** license is leaving the principle's enumerated list of seven stale. `VisibilityService`
was added by an implementation rather than a product decision, exactly as this is, and the
constitution records that it *"is listed for a reason worth stating"* — the listing is the
ratification act, performed in v3.1.0.

**Consequence for planning**: US5 is gated on a **MINOR amendment (v5.1.0)** adding the eighth
capability to Principle V. This is governance hygiene rather than a reversal — no prohibition is
lifted and no delivered requirement retracted — but it must land before US5's code, and it is not
optional. The five other user stories are unaffected and can proceed.

**The two halves are asymmetric and the interface must say so.** Chromium fires
`beforeinstallprompt` and can present a real prompt; **iOS Safari fires nothing and exposes no
install API at all**, so its half is instructional copy and cannot be anything else. An interface
modelling only the Chromium shape would make the iOS path look like a failure rather than a
different platform.

**Alternatives considered**:
- *A lint exemption for one call site.* Rejected on the reasoning the constitution already applies to
  `VisibilityService`: *"an exemption would have traded a structural boundary for a poll interval."*
  The same trade here buys an install banner.
- *Detect via the service worker.* A worker cannot answer whether the page is running standalone.
- *Skip detection; always show the guidance.* Contradicts FR-1031's "when, and only when", and would
  nag an attendee who has already installed.

---

## R3 — Where does the password reveal control live, given it serves two products?

**Decision**: **Implement it in each product**, with a shared **behavioural contract asserted by
tests in both**, and record the duplication deliberately.

**Rationale**: There is **no shared UI package**. `packages/` holds `config`, `data` and `platform`
only. `apps/admin/package.json` depends on `@mynet/data` and `@mynet/config` — and deliberately
**not** on `@mynet/platform`, because 013 established that the administrative site needs none of the
device capabilities and that its absences are *"structural rather than configured"*.

So FR-1050's stated goal — *"one behaviour is described in one place rather than two implementations
diverging"* — has no place to be satisfied literally without creating infrastructure this feature did
not scope.

Creating `packages/ui` to hold one control is the shape this project has twice rejected for adjacent
reasons: it would be a package whose only member is a password field, and it would give the
administrative site its first dependency on shared *presentation*, which is precisely the coupling
that keeps the two products' information architectures independent. `apps/admin`'s own description
says it *"shares no destination, Home card or navigation contract with @mynet/web."*

**What makes the duplication safe is the test, not the code.** Both products get the same
behavioural assertions — reveal toggles, state never persists, label announces action and state,
keyboard operable — so a divergence fails a build rather than being noticed by a person. That is the
same mechanism this project uses for absences.

**Alternatives considered**:
- *`packages/ui` with one component.* Rejected above; revisit if a second shared control appears,
  which would make it a package rather than a wrapper.
- *Put it in `@mynet/config`.* Rejected: that package is TypeScript and Vitest bases, and a React
  component in it would be a category error.
- *Only build it in MyNet.* Contradicts FR-1049 and the whole point of C3's declaration row.

---

## R4 — How are the install icons derived from a second source?

**Decision**: A **separate derivation path beside the board pipeline**, not a parameterisation of it,
with its own crop and its own recorded upscale exception.

**Rationale**: `scripts/generate-brand-assets.mjs` reads `assets/brand/logo.png` and calls
`assertBoardDimensions`, which refuses anything that is not 1254×1254 because *"a crop rectangle is
meaningless against different dimensions."* `new-logo.png` is 114×133 RGBA. Passing it through the
same function is exactly what that guard exists to prevent.

The board path also derives its plate colour from a source with **no alpha channel** — the mark's
antialiased edges are blends against its own navy, which is why any other plate haloes. The new
source **has** alpha, so that derivation does not apply and FR-1044 requires the plate be chosen
deliberately and recorded.

**The upscale is real and must be named rather than tolerated.** The mark region is ~114px; a 512px
icon needs ~300px to fill the maskable safe zone (a circle of 80% *diameter*, which 010's planning
established against a natural reading of 80% of the side). That is roughly **4×**.
`scripts/brand-audit.mjs` fails the build on any upscale — a check 010 added after finding one asset
drawn at 1.06× and fixing the *asset*. FR-1045 requires the exception name the file, the factor and
the outputs, so that a *second* upscale still fails.

**Alternatives considered**:
- *Generalise `generate-brand-assets.mjs` to take a source parameter.* Rejected: the crop rectangle,
  plate derivation and safe-zone maths are all measured against one specific image. A parameterised
  pipeline would carry two sets of constants selected by a flag, which is the shape that lets the
  wrong constants apply silently.
- *Relax `assertBoardDimensions`.* Rejected — it is the guard that makes the whole approach
  reviewable.

---

## R5 — How is the composer bounded to a proportion of the visible thread area?

**Decision**: Bound the composer against the **thread pane's own height**, with the send control
outside the bounded region, so FR-1003 holds by construction.

**Rationale**: FR-1002 fixes the *kind* of rule (a proportion) and leaves the value to planning. The
mechanism that makes it correct is placement rather than arithmetic: if the send control is a sibling
of the bounded region rather than inside it, no composer height can displace it, and the requirement
stops depending on a value staying true.

The current composer is `resize-y` with no maximum, inside a row whose sibling is the 44px send
button. `resize-y` must go (FR-1005) — a reader-chosen height can violate FR-1003 no matter what the
bound says.

**On the on-screen keyboard**: the visual viewport shrinks when the keyboard raises, and a proportion
of a shrinking container shrinks with it. That is the property that makes one rule work across the
configuration that produced the original defect.

**Alternatives considered**: a line count and a fixed height, both rejected in the specification's
clarification round — a fixed count on a short viewport with a tall keyboard is the original defect
under another name.

---

## R6 — What shape does the conversation-list refresh take?

**Decision**: Reuse `useConversation`'s established poll shape — visible-only, jittered, backing off
on consecutive failure — at **10 seconds** rather than three, with the additional pause condition
FR-1054 adds.

**Rationale**: The thread's poll already encodes every decision this one needs and records why:
visible-only because *"a backgrounded tab is a tab nobody is looking at"*; jittered so *"a hall full
of clients does not re-converge on the same instant after an outage"*; backing off to a ceiling
because *"during an incident the load has to drop, not hold steady"*; and a failure threshold of
three because announcing a single missed tick *"would train people to ignore the notice."*

Copying the reasoning rather than the code is the point — but the two pollers differ in one way that
matters, and FR-1054 is it: the thread polls whenever it is open, while the list additionally pauses
when the layout has replaced it with a thread.

**Nothing here is a cache** and the distinction must survive: the list is rendered state with no
lifetime beyond the mount, which is the same distinction `useConversation` and 006's `useDirectory`
both had to draw. FR-1013 keeps Messages uncached.

**Alternatives considered**: server-sent events or a socket. Rejected — a second transport for a
lower-stakes surface than the one already polling, on a two-vCPU host, and Principle V would want a
port for it.

---

## Cross-cutting: what this feature must NOT disturb

Recorded because four of the five review-gate findings came from changing something 008 built without
noticing what depended on it.

- **The three absences in card resolution** — no discoverability condition, no verification
  condition, no registration join. FR-1027 keeps them, and R1's guard is a *share-time* check, which
  is a different question.
- **`shared_cards.event_id` is `ON DELETE NO ACTION` deliberately.** The reciprocal row inherits this;
  the seed's whole-domain clear exists because of it.
- **The unique constraint is directional and unnormalised** — the docblock says normalising *"would
  be a bug rather than a tidy-up"*, and mutual exchange is precisely why.
- **Blocking severs card resolution read-side**, so lifting a block restores contacts with no write.
  Mutual exchange must not turn that into a repair path.
- **`card_share` throttling** already bounds the rate of unilateral writes against another attendee.
  Mutual exchange doubles the rows per call, so the existing limit now admits twice the write volume
  at the same request rate — worth checking rather than assuming.
