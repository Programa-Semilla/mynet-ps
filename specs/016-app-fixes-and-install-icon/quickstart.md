# Quickstart — 016 validation walkthrough

**Date**: 2026-08-12
**Spec**: [spec.md](../016-app-fixes-and-install-icon/spec.md) · **Plan**: [plan.md](./plan.md)

Nine scenarios. **Two of them cannot be automated and are the reason this feature exists** — a person
found what the gates could not. Scenarios 8 and 9 need a physical phone.

> **This project has four outstanding by-hand walkthroughs already** — 007's, 008's, 009's and 013's.
> This one covers defects a person reported, so walking it is the acceptance rather than a formality.

## Prerequisites

```bash
pnpm install
pnpm start          # API + MyNet + administrative site, prints a generated operator credential
```

Two browser profiles signed in as different attendees registered for the same conference. Both must
be **discoverable** and **verified** — FR-1053 requires it, and a non-discoverable second profile
makes scenario 5 refuse correctly and look broken.

---

## Scenario 1 — The composer stays usable (US1, FR-1001–FR-1006, SC-1001)

1. Open a conversation on a mobile viewport (390×844) with an on-screen keyboard raised.
2. Type at least 500 characters.

**Expected**: the composer grows, then stops at a proportion of the visible thread area. **The send
control never leaves the viewport.** Content scrolls inside the composer past the bound. The page
itself never scrolls horizontally.

3. Try to drag the composer's bottom edge.

**Expected**: nothing — it is no longer resizable (FR-1005).

4. Clear the field, then enter only spaces and newlines.

**Expected**: send is **disabled**, not an error after submitting (FR-1006).

---

## Scenario 2 — The conversation list stays current (US2, FR-1007–FR-1013, SC-1002, SC-1003)

1. Profile A: open Messages and **stay on the list**. Do not navigate.
2. Profile B: send A a message in an existing conversation.

**Expected**: within **15 seconds**, A's list shows the new message and its unread indicator —
without A touching anything. This is the defect the owner reported, and note it covers *existing*
conversations, not only new ones.

3. Profile A: scroll the list, then wait for a refresh.

**Expected**: scroll position and focus are preserved (FR-1011).

4. Profile A: switch to another browser tab for a minute, then return.

**Expected**: no requests while hidden; **an immediate refresh on return**, not a wait for the next
tick (FR-1008).

5. Stop the API. Watch the list for ~a minute. Restart it.

**Expected**: the interval backs off rather than hammering; after three consecutive failures the
reader is told the list has stopped keeping up, worded distinguishably from being offline (FR-1010);
it recovers **without a reload** (FR-1009).

---

## Scenario 3 — The list pauses when it is not on screen (US2, FR-1054)

1. **Mobile width.** Open a conversation, so the thread replaces the list. Watch network activity.

**Expected**: **no list requests** while the thread is displayed — only the thread's own 3-second
poll. Returning to the list resumes them.

2. **Desktop width.** Open a conversation, so list and thread are both visible.

**Expected**: **both** poll. The list beside an open thread must not go stale.

---

## Scenario 4 — Passwords, on both products (US3, FR-1014–FR-1020, FR-1049, FR-1050, SC-1004, SC-1005)

Walk **all five** screens: MyNet sign-up, MyNet password reset, MyNet sign-in, **administrative
sign-in, administrative credential replacement**.

1. Type a password. Activate the reveal control **using the keyboard only**.

**Expected**: value becomes readable; activating again masks it. The control announces both its
action and the current state to a screen reader (FR-1016).

2. Navigate away and back, or reload.

**Expected**: the field is **masked again** — reveal state is never remembered (FR-1015).

3. On sign-up and password reset: enter mismatched password and confirmation.

**Expected**: submit is **disabled** with the mismatch described. **No request is made** (FR-1018).

4. Confirm the administrative screens behave identically.

> The administrative credential-replacement screen has had a confirmation field since 013 — it is the
> **reference implementation**, not new work. MyNet was the product missing it.

---

## Scenario 5 — Cards exchange mutually (US4, FR-1021–FR-1030, FR-1053, SC-1006)

1. Profile A: open B's profile in Discover and share a card. **B does nothing.**
2. Profile A: open Network.

**Expected**: B is in A's contacts.

3. Profile B: open Network **without having acted at all**.

**Expected**: **A is in B's contacts.** This is C1.

4. Profile B: block A. Both check Network.

**Expected**: the card is severed **in both directions** (FR-1026).

5. Profile B: unblock A. Both check Network.

**Expected**: both contacts return **with no repair action** — blocking suspends read-side, it does
not delete.

6. Profile A: share with B again.

**Expected**: `200`, no duplicate contact, and the original exchange instant unchanged (FR-1025).

7. Turn B's discoverability **off**. Profile A (or a third attendee) tries to share with B.

**Expected**: a **reasonless refusal**, identical to blocked (FR-1053, FR-1028). Nothing distinguishes
"undiscoverable" from "blocked" from "does not exist".

8. Check both attendees' Home and any notification surface.

**Expected**: **nothing** (FR-1029). No notification is dispatched for a card exchange, and the bell
does not exist.

---

## Scenario 6 — Install guidance (US5, FR-1031–FR-1037, SC-1008)

> Blocked on the **v5.1.0 amendment** listing the eighth device capability — see
> [plan.md](./plan.md) Complexity Tracking. Do not walk this before it lands.

1. Uninstalled mobile browser → sign-in screen.

**Expected**: guidance appears, saying installing is what **enables notifications** (FR-1032), with
steps matching the platform.

2. **Android/Chromium**: a real install control. **iOS Safari**: written steps and **no control that
cannot work** (FR-1034).
3. Desktop browser, and an already-installed instance.

**Expected**: **no guidance** in either case.

4. Dismiss it, reload.

**Expected**: it does not return (FR-1035).

5. Confirm the guidance never requests notification permission (FR-1036) and never delays sign-in
   (FR-1037).

---

## Scenario 7 — Icons and marks (US6, FR-1038–FR-1048, SC-1010)

```bash
pnpm build && node scripts/brand-audit.mjs
```

**Expected**: passes. Then run the generator twice and compare — output is **byte-identical**
(FR-1042).

1. Look at every in-app mark: rail, top bar, five auth screens.

**Expected**: **unchanged** — still the coral mark from the board (FR-1039).

2. Look at the administrative site's favicon.

**Expected**: **unchanged** (FR-1040).

3. Delete a declared icon file and rebuild.

**Expected**: **build fails** (FR-1046).

4. Change an asset to exceed the recorded upscale exception and rebuild.

**Expected**: **build fails** (FR-1045). The exception names one file, one factor, specific outputs —
a *second* upscale must still fail.

---

## Scenario 8 — On a physical phone (SC-1009) — **NOT AUTOMATABLE**

1. Install MyNet to a real iPhone home screen.

**Expected**: the icon shows the **new mark**, legibly, with no wordmark and nothing clipped by the
circular mask.

2. Judge the white "N" counter-form.

The gradient upscales cleanly; the hard edges are what soften. **This is a person's judgement and no
gate substitutes for it** — the source is 114×133 and the icon is 512.

3. Repeat scenario 1 on the physical device with the real keyboard.

---

## Scenario 9 — Atomicity under failure (SC-1007) — needs fault injection

Induce a failure on the **second** insert of a mutual exchange.

**Expected**: **neither** record exists. Contacts are mutual or absent, never one-sided (FR-1022).

This is the shape 013 used to prove an administrative act and its audit entry commit together, and it
cannot be demonstrated by a passing happy path.

---

## What passing does not prove

- **Register entry 4 is not closed.** Walking these scenarios is not the client's validation of
  desktop and tablet layouts.
- **Register entry 28 stays open.** Two brand marks now coexist by the owner's direction; scenario 7
  confirms the divergence is as intended, not that it is resolved.
- **The other four walkthroughs remain outstanding.** This one adds to 007's, 008's, 009's and 013's
  rather than discharging any of them.
