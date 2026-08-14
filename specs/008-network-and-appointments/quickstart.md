# Quickstart: validating 008

**Feature**: 008 | **Date**: 2026-08-10

How to prove Network actually works. Scenario numbers map to the spec's user stories; contract
details live in [`contracts/`](./contracts/) and schema details in [`data-model.md`](./data-model.md)
rather than being repeated here.

---

## Prerequisites

**Two accounts, in two browser profiles.** Every guarantee in this feature is about two people who
are not interchangeable — card sharing, proposal and acceptance, blocking. A single-account
walkthrough proves almost nothing, exactly as it did in 007.

> **SUPERSEDED IN PART — read before walking this.** This document described sharing as
> **one-directional**, which was correct when 008 shipped and is no longer. Constitution **v5.0.0
> (C1)**, ratified 2026-08-12, made a card exchange **mutual**: one act, and both parties hold each
> other's card. Feature **016** delivered it.
>
> So wherever a scenario below expects the sharer to receive nothing until the recipient shares
> back, **the current, correct behaviour is that both contacts appear immediately**. That is not a
> defect and must not be reported as one. Everything else here — proposal and acceptance, slot
> availability, blocking — is unchanged.
>
> Left annotated rather than rewritten: this file is also the record of what 008 shipped, and 008's
> own walkthrough has never been completed.

**A third account is needed for scenario 2 only**, to hold a card from someone who is not registered
for the event you are looking at.

### One command

```bash
git config core.hooksPath .githooks     # once per clone
pnpm install
pnpm start
```

`pnpm start` creates `.env` if absent, starts the `mynet-pg` container, applies migrations, runs the
seed, and runs the API and client. It is idempotent. `pnpm start --reset` rebuilds from zero, which
is how you return to a clean slate after a walkthrough that blocked somebody or deleted an account.

**`pnpm start --reset` is required at least once for this feature**, because migration `0007` seeds
the meeting-slot grid and an existing database will have no slots. Without it, every scheduling
scenario shows the no-slots state and looks broken.

---

## Scenario 1 — Keep someone you just met *(US1)*

1. In profile **A**, open Discover and find attendee **B**. Open their profile.
2. Choose the share action. **Read its label before activating it** — it must say whose card moves
   (FR-603). This is the single most misreadable control in the feature.
3. Confirm A's own Network is **unchanged**. Sharing gives; it does not take.
4. In profile **B**, open Network. A appears as a contact, with the event they met at and when.
5. Back in A, share again. B still has **exactly one** contact for A, and the timestamp has not
   moved (FR-604).
6. In A, edit company and role. Reload B's Network — the contact shows the new values with B doing
   nothing (FR-611, SC-603).

**Expected**: a contact resolving live, created by one deliberate act, duplicated by nothing.

---

## Scenario 2 — A relationship that outlives the conference *(US2)*

1. With B holding A's card, switch B to a **second event** A is not registered for.
2. The contact is still listed and still resolves (FR-614, SC-602).
3. In A, turn **discoverability off** in account settings.
4. A vanishes from Discover for everybody — and remains a resolvable contact for B (FR-612).

**Expected**: discoverability governs being *found*, not being *remembered*. If B's contact goes
blank here, the standing-consent rule has been lost and the feature's whole purpose with it.

---

## Scenario 3 — Propose a meeting *(US3)*

1. In A, open the scheduling dialog from B's contact or profile.
2. With no slot chosen, or a whitespace-only topic, the confirm control is **disabled** — not an
   error after submitting (FR-629).
3. Save a session in A's Agenda that overlaps a slot, reopen the dialog: **that slot is gone**
   (FR-625).
4. **The measurement that matters** (SC-608a): note A's offered slots. Now have B save sessions and
   accept a meeting with somebody else across the whole day. Reopen A's dialog — **A's offered set
   is identical.** Nothing about B may change what A is offered (FR-626).
5. Send the proposal. Both parties see it pending, with the slot in **venue time** and the topic.
6. Press Escape. The dialog closes and focus returns to the control that opened it (FR-655).

**Expected**: availability is a function of the reader's own commitments alone. Step 4 is the
Principle VIII test — if B's schedule changes A's options, the invitee's Agenda is leaking by
omission.

---

## Scenario 4 — Answer a proposal *(US4)*

1. In B, accept. Both see a confirmed appointment.
2. Propose again from A for a different slot, then decline in B. Both see it declined, and **the
   slot is selectable again for A** (FR-633).
3. Cancel a confirmed appointment from either side; the slot frees for **both**.
4. **The conflict case** (FR-633a): from A propose slot X to B. Before B answers, have B confirm
   something else at X. B accepts — acceptance is **refused**, and B is told they already have a
   commitment then. Check the wording: it must describe **B's own schedule to B**, never mention A's.
5. Sign in as a third account and request the appointment by its identifier. The response must be
   indistinguishable from one that does not exist (FR-636).

---

## Scenario 5 — Home tells you *(US5)*

1. With a pending proposal awaiting A, load Home.
2. The appointment summary card shows it as needing an answer, with a route to answer it (FR-645).
3. **No notification is dispatched. Confirm none arrives** — this is not an omission to fix
   (FR-643). Home is the only way an attendee learns of a proposal, which is why step 2 matters.
4. Break the card's data source (stop the API, reload). The card shows **its own** failure state and
   every other Home card still renders (FR-646, SC-607).

---

## Scenario 6 — Ending it *(US6)*

1. With A and B holding each other's cards and a confirmed appointment between them, **block** from
   either side.
2. Both contacts stop resolving, in both directions. Sharing again and scheduling are refused
   (FR-608, FR-637) — **check the refusal gives no reason**.
3. The appointment is **cancelled**, not hidden, and the slot is freed (FR-637a).
4. **Lift the block.** The contact resolves again — but the appointment stays cancelled. Blocking
   suspends a relationship and ends a commitment; those are different, deliberately.
5. Delete account A entirely. In B's Network the contact is **gone**, not a nameless entry
   (FR-651), and the appointments are gone for both (FR-652).
6. Export B's data. It contains cards shared, cards held, and appointments in both roles (FR-653).

---

## Offline

1. Load Network with appointments, then go offline (DevTools → Network → Offline).
2. Appointments for the active event still read, **stamped with when they were retrieved**
   (FR-647).
3. Contacts **refuse** rather than showing stale data — this is deliberate, not a bug (FR-648).
   Resolving a card reads another person's live profile, which is the argument that made Discover
   uncached in 006.
4. Attempt to share, propose, accept or cancel. Every write is **refused**, never queued (FR-649).

---

## Layouts and accessibility

Walk scenarios 1, 3 and 4 at **all three widths** — the desktop two-pane Network, the tablet stacked
form, the mobile segmented control.

- Nothing scrolls horizontally at any width (FR-659, SC-612).
- The whole feature is operable by keyboard alone with every focus position visible (SC-611).
- Escape dismisses both the scheduling dialog and the confirmation, focus returning to the opener
  each time.

**Record what you find about desktop and tablet.** They remain unvalidated by the client — the
approved prototype is mobile-only at 390×844 — so this walkthrough is, again, the only review those
layouts will have had before 010.

---

## Automated equivalents

Everything above except the layout walk is covered by integration and e2e tests. The by-hand walk
still matters, and 007 is the evidence: **its scenario 5 found two defects nothing else could.**
Note also that 007's T148 was never finished, and it carried forward — do not let 008's repeat that.
