# Brainstorm: App fixes, mutual card exchange, and the install icon

**Date:** 2026-08-12
**Status:** active
**Feeds:** feature **016**

## Problem Framing

The owner used the running product and brought back six things. Four are defects — three of them
invisible to every gate this project has — one is a missing affordance, and one reverses a standing
decision ratified two days ago. They are grouped as one feature because five of the six are small,
attendee-facing and independent of everything else in flight; the sixth is small in code and large
in governance, and separating it would leave an amendment with no delivery attached.

**This is the second time a person looking at the running product has found what 135 e2e tests, five
review agents and CodeRabbit did not.** 008's scheduling dialog rendered in the top-left corner;
this session's mobile composer grows until its send button is unreachable. `CLAUDE.md` already
records the lesson — *layout is the part of this product no gate examines* — and this feature is the
second piece of evidence for it rather than a new discovery.

## What was verified, and how

Each item was checked against source before it was scoped. Two of the six turned out not to be what
they were reported as.

### 1. Messages sent from a card do not appear in the list — **confirmed defect**

`apps/web/src/app/messages/Messages.tsx:80` loads the conversation list in an effect keyed
`[repository, attempt]`. There is no poll and no invalidation.

The reason it looks intermittent rather than broken is the routing. `/messages/new/:attendeeId` and
`/messages/:id` are **nested inside** the `Messages` destination, so opening a thread from a card
(`AttendeeProfile.tsx:367`) does not unmount `Messages` and the effect never re-runs. The thread
itself polls every three seconds (`useConversation.ts`), so the *conversation* is live while the
*list beside it* is frozen at whatever it held on arrival. Leaving the destination and returning
remounts it, which is exactly the workaround the owner found.

The consequence is wider than the reported symptom: **unread indicators and last-message previews in
the list are stale for as long as Messages is open**, for every conversation, not only new ones.

### 2. The mobile composer grows until Send is unusable — **confirmed defect**

`Composer.tsx:140` is `resize-y` with `rows={2}` and **no maximum height**, inside a
`flex items-end` row whose sibling is the 44px send button. Nothing bounds the growth, so on a phone
the composer expands into the space the on-screen keyboard already took, and the button leaves the
viewport.

Layout again, and invisible to every behavioural test for the same reason as 008's dialog: the
button exists, is labelled, is focusable and submits.

### 3. No password reveal, and no confirm-password field — **confirmed absent**

Five password inputs exist and none has a reveal control:
`apps/web/src/app/auth/SignUp.tsx`, `apps/web/src/app/auth/ResetPassword.tsx`,
`apps/web/src/auth/SignInScreen.tsx`, and — **the admin counterpart** —
`apps/admin/src/app/auth/SignIn.tsx` and `apps/admin/src/app/auth/ReplaceCredential.tsx`.

A repository-wide search for a confirm-password field returns nothing. It has never existed on
either product.

This is the item that proves the new admin-counterpart rule pays for itself immediately: the
obvious reading of the request is "the sign-up screen", and the correct answer is five screens
across two products, two of which the owner was not looking at when he wrote it down.

### 4. Mutual card exchange — **not a defect; reverses a ratified decision**

Standing decision 25, constitution **v3.2.0 N2**, ratified 2026-08-10: *sharing is one-directional
— it gives your card and takes nothing.* The request inverts it.

### 5. Install instructions for a phone that has not installed — **absent, and partly impossible**

No install detection exists anywhere: no `display-mode: standalone` check, no
`beforeinstallprompt` listener, nothing. The premise is also correct — Web Push on iOS requires the
app to be installed to the Home Screen, so an uninstalled iPhone genuinely cannot receive
notifications no matter what permission it grants.

The halves are not symmetric and the spec must say so. Android/Chromium fires
`beforeinstallprompt` and can offer a real button. **iOS Safari fires nothing and exposes no install
API**, so its half is instructional copy and cannot be anything else.

### 6. The new install icon — **deliverable, with three recorded costs**

`assets/brand/new-logo.png` is **114×133px, RGBA**, and depicts a gradient disc with a white "N"
above a "MYNET" wordmark. `assets/brand/logo.png` — the board decision 30 names as the single
source — is 1254×1254 RGB and depicts a coral round-capped N on navy. **They are different marks.**

The owner's decision is that this is **an app-icon change and not a rebrand**, and that this file is
what exists. That is licensed, and it is what this feature builds. Three costs travel with it and
are recorded rather than absorbed:

- **It is an upscale, and the pipeline currently fails the build on one.** The mark region is
  roughly 114px tall; a 512px icon needs ~300px to fill the maskable safe zone, so this is about
  **4×**. `scripts/brand-audit.mjs` exists specifically to fail this, after 010 found `icon-512.png`
  rendering a 300px master at 317px and fixed the asset rather than the check. The right move is the
  same discipline in the other direction: **record a measured exception naming this asset and this
  scale factor**, never weaken the check until it stops checking anything.
- **The gradient survives scaling; the white "N" does not.** A smooth gradient upscales without
  visible detail loss. The counter-form's hard edges will soften. This is only assessable on a real
  home screen, which is a person's job and not a gate's.
- **The home-screen icon will differ visibly from the in-app mark**, which stays coral. Knowingly
  accepted by the owner. Recorded so that a later reader does not "fix" it.

`assertBoardDimensions` in `scripts/generate-brand-assets.mjs` will refuse this file by design — it
asserts 1254×1254 because *"a crop rectangle is meaningless against different dimensions"*. The
install-icon path therefore needs its own source and its own crop, beside the board pipeline rather
than inside it.

## Approaches Considered

### The Messages list

#### A: Poll the list on the same terms as the thread — **chosen**
- Pros: One mechanism, already proven in `useConversation.ts` — visible-only, jittered, backing off
  on failure. Fixes the reported symptom *and* the stale unread indicators, which no narrower fix
  does. An attendee watching the list sees a message arrive without touching anything, which is what
  the list appears to promise today.
- Cons: A second poller. Per-request session writes are already an inbox entry
  (`session-write-per-request`), and this adds to that load rather than relieving it.

#### B: Invalidate on send
- Pros: Cheapest possible change; no new request while idle.
- Cons: Fixes the reported symptom only. The list stays frozen for *received* messages, so an
  attendee looking at their conversation list still learns nothing until they navigate away and
  back. It repairs the sentence the owner wrote and not the defect behind it.

#### C: Refetch on route change within the destination
- Pros: No timer at all.
- Cons: Freshness becomes a function of navigation, which is arbitrary — sitting on the list, the
  surface most likely to be watched, is the one case it never covers.

### The composer

#### A: Cap the height and auto-grow to the cap — **chosen**
- Pros: The field grows with what is typed, up to a bound that keeps the send control in the
  viewport, and stops. Standard messaging behaviour; nobody has to learn it.
- Cons: Requires a real number, justified against the smallest supported viewport with a keyboard
  raised, which is not a thing any current test can measure.

#### B: Remove `resize-y` and keep two rows fixed
- Pros: One-character fix.
- Cons: A long message becomes a two-row scroll box. Trades an unreachable button for an unreadable
  composer.

#### C: Pin the send control outside the growing region
- Pros: The button is unconditionally reachable however tall the field gets.
- Cons: An unbounded field still eats the thread it belongs to, and on a short viewport there is
  eventually no conversation left on screen.

### Mutual card exchange

#### A: True mutual exchange — **chosen by the owner**
- Pros: Matches the physical act the feature is named after. One tap, both hold a card, no pending
  state and no second surface. It also removes a real asymmetry: today an attendee can give their
  card to somebody who never reciprocates and has no way to ask.
- Cons: Reverses v3.2.0 N2. One person's unilateral act now takes another person's live profile
  pointer without that person acting.

#### B: Share, then prompt the recipient to share back
- Pros: Preserves consent exactly; no amendment; mirrors 008's propose/accept asymmetry, which
  exists for the same reason.
- Cons: The exchange completes late or never, needs a surface for the prompt, and re-introduces the
  pending state 008 already found to be a dead end when nobody answers.

#### C: Mutual only between co-attendees of a live event
- Pros: Narrower blast radius.
- Cons: Two behaviours behind one button, with the boundary invisible to the person pressing it.

**The amendment must be argued on the right ground.** The physical-card metaphor is not sufficient
— N2's reasoning was never about metaphor. The defensible argument is that a card exposes only what
its owner already chose to publish to co-attendees (the client says the same thing independently at
REQ-046), so a mutual exchange discloses nothing that discoverability had not already disclosed;
and that 007's block already severs cards in both directions, so the escape hatch predates the
change. Standing decision 16's one-visibility-decision-per-attendee rule is what makes that argument
work, and the amendment should cite it.

Two consequences that must reach the spec rather than be discovered in implementation:

- **`shareCard` writes two rows in one transaction, or none.** A half-completed exchange is a state
  the model has no name for.
- **Sharing with somebody who is not discoverable** currently refuses. Under mutual exchange the
  question becomes whether the *recipient's* discoverability gates what the sharer receives, and
  decision 25's "discoverability governs being found, not being remembered" does not settle it,
  because this is a first acquisition rather than a resolution of a card already held.

## Decision

Deliver **016 — App fixes, mutual card exchange, and the install icon**: one attendee-facing feature
carrying five repairs and one reversal, with **no migration** (mutual exchange adds a second
`shared_cards` row, not a column), gated by a constitution amendment covering the reversal, the
icon-upscale exception, and the new admin-counterpart rule.

**The admin-counterpart rule lands here, as governance rather than as a habit.** The owner's
instruction — *anything requested in the App must be checked for whether its administrative
counterpart exists or must be built* — is a standing decision, not a preference, and this feature
is where it first pays: the password work is five screens across two products, and the naive
reading was one.

## Key Requirements

1. **The conversation list stays fresh while it is on screen**, on the same visible-only, jittered,
   backing-off terms the thread already uses. Unread indicators and previews are covered, not only
   newly created conversations.
2. **The composer grows to a bound and stops**, with the send control reachable at the smallest
   supported viewport with a keyboard raised.
3. **Every password field on both products gains a reveal control**; sign-up and password reset gain
   a confirm field. Five screens: three in `apps/web`, two in `apps/admin`.
4. **Reveal is a per-field toggle that never persists**, and the confirm mismatch is a disabled
   submit rather than a post-submit error — the binding rule already applied to empty messages and
   empty meeting topics.
5. **Sharing a card is mutual**, in one transaction or not at all.
6. **The sign-in screen tells an uninstalled phone how to install**, with Android and iOS treated as
   the different problems they are: a real prompt where the platform offers one, instructions where
   it does not. It states what installing is *for* — notifications — rather than asking for its own
   sake.
7. **The install icon is derived from `new-logo.png` by a readable script**, as decision 30 requires
   of every brand asset, with the wordmark cropped off and the upscale recorded as a measured
   exception in `brand-audit.mjs`.
8. **The in-app coral mark is untouched**, and register entry 23 stays open and unaffected.
9. **The admin counterpart of every item is stated explicitly**, including where it is *none*.

## Open Questions

- **The composer's maximum height, as a number**, justified against the smallest supported viewport
  with a keyboard raised. No current gate can measure this; `e2e/responsive.spec.ts` measures dialog
  gaps and is the nearest precedent for how to assert it.
- **Does the list poll pause while a thread is open?** Two pollers against the same conversation
  from one screen is duplicated load on the two-vCPU VM, and the thread's own poll already covers
  the open conversation. The desktop two-pane layout shows both at once, so "pause" and "don't"
  are both defensible.
- **Whether mutual exchange requires the recipient to be discoverable.** Sharing checks it today.
  Resolution deliberately does not (FR-612). This is a first acquisition and is neither case.
- **What the exchange tells the recipient.** They now hold a card they did not ask for. No
  notification may be dispatched — the trigger set is a received message and nothing else — so the
  only honest surfaces are the Network destination and Home.
- **Whether `listShared` finally gets a surface.** It has existed since 008 with no consumer
  (`card-read-surfaces-without-consumers` in the inbox). Mutual exchange makes "cards you have
  given" and "cards you hold" the same list for most pairs, which either closes that entry or makes
  it moot.
- **The maskable plate colour for the new icon.** The board pipeline derives navy `#0d1942` from a
  source with no alpha; this source *has* alpha and is a gradient, so the halo argument does not
  transfer and a plate colour must be chosen deliberately.
- **Whether an install hint may be dismissed permanently**, and where that is remembered. A banner
  on every sign-in for somebody who has chosen not to install is nagging.
