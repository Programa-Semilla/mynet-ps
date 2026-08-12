# Quickstart: Conference Content Authoring (014)

Nine scenarios. **1–5 a machine can check; 6–9 need a person**, and this project has learned the
difference the hard way — 008's scheduling dialog rendered in the top-left corner having passed 135
e2e tests, five review agents and CodeRabbit, because every one of them checks behaviour and none
looks at where a thing is.

**T-numbers for scenarios 6–9 join the outstanding by-hand walkthroughs from 007, 008, 009 and 013
rather than replacing them.**

## Prerequisites

```bash
pnpm install
pnpm start          # API + MyNet + admin site; prints a generated operator credential
```

`pnpm start` brings up all three and issues the credential (013). The bootstrap never resets a
password an operator chose, so it is safe to re-run.

Two browser profiles are needed throughout: one signed into the **admin site** (`admin.<host>`), one
signed into **MyNet** as an attendee registered for the conference under test.

---

## Scenario 1 — Author a programme (US1, FR-1001–FR-1006)

1. Sign in to the admin site as the seeded platform operator.
2. Open a seeded conference. Add a track (colour from the token list — **confirm there is no free
   colour input**), a room, and a speaker.
3. Create a session referencing all three.
4. In MyNet, open Agenda for that conference.

**Expected**: the session appears with the right time, track, room and speaker. **Confirm the seed's
two disjoint programmes and the empty third conference are intact** (FR-1043) — re-run `pnpm db:seed`
and check nothing broke.

**Also confirm**: no route from the speaker form reaches an attendee profile (FR-1006), including
when the speaker's name matches a registered attendee.

---

## Scenario 2 — Delete is available only while untouched (US2, FR-1018, FR-1019)

1. Create a session. Delete it. **Expected**: gone.
2. Create another. In MyNet, save it, write a note on it, ask a question, upvote the question.
3. In the admin site, attempt to delete it.

**Expected**: refused with **409**, carrying a reason and offering cancellation, showing engagement
as **counts only with no attendee named** (FR-1025).

---

## Scenario 3 — Cancellation preserves everything (US2, FR-1020–FR-1023)

1. Cancel the session from scenario 2.
2. In MyNet, open Agenda and the session panel.

**Expected**: presented as cancelled rather than missing; the private note still readable; the
question and its votes still there; the Q&A composer closed. The attendee can remove it from their
own saved list (FR-1023).

3. Reinstate it in the admin site. **Expected**: it returns, and **no notification is dispatched**
   (FR-1024).

---

## Scenario 4 — Up next skips a cancelled session (FR-1022a)

1. Save two sessions, an hour apart. Cancel the earlier one.
2. In MyNet, open Home.

**Expected**: **"Up next" names the later session**, not the cancelled one. The rest-of-day timeline
still shows the cancelled session, marked. This is the single behaviour where showing the
cancellation would be worse than omitting it.

---

## Scenario 5 — The race (FR-1019a)

**Not a by-hand scenario — it belongs to the integration suite against a real `postgres:17`**, and it
is recorded here because it is the property this feature most depends on and the one no layer above a
real database can test.

Open a transaction, `SELECT … FOR UPDATE` the session, and concurrently attempt a save from another
connection. **Expected**: the save blocks until the transaction ends; in no interleaving is a
committed row destroyed. This is 009's FR-714 mechanism, and 009's own test file is the model.

---

## Scenario 6 — Notification for a saved session *(needs a person and a device)*

1. In MyNet, grant notification permission and save a session.
2. In the admin site, change its **room**.

**Expected**: one notification naming the session and the change, within a minute (SC-1004).
Activating it opens that session. The Agenda row carries a marker until viewed; opening it clears the
marker.

3. Change the session's **title**. **Expected**: **nothing** — no notification, no marker (FR-1027).
4. As an organizer who is *also* registered and has saved the session, change its room.
   **Expected**: **no notification to yourself** (FR-1028a).

---

## Scenario 7 — Coalescing, and the absence it must not become *(needs a person)*

1. Save four sessions as one attendee.
2. In the admin site, shift the whole afternoon in **one action**.

**Expected**: **exactly one notification**, stating that four of your saved sessions changed.
Activating it opens **Agenda**, not a list of changes (FR-1034b). Each of the four rows carries its
own marker.

3. An hour later, cancel one of them as a **separate** act. **Expected**: a **second** notification —
   coalescing is per action, never per time window (FR-1028b).

**Then look for what must not exist** (FR-1031): no badge with a number in either client, no "what
changed" screen, no bell. The count exists in the notification payload and nowhere else.

---

## Scenario 8 — Denied permission is a complete product *(needs a person)*

Deny notification permission, then repeat scenario 6.

**Expected**: no notification, **the in-app marker still appears** (FR-1032), and every other surface
behaves identically. This is v3.1.0's FR-552 rule applied to the second trigger.

---

## Scenario 9 — The three widths, and a screen-reader pass *(needs a person)*

**This is the scenario register entry 4 is about, and 014 escalates that entry rather than closing
it.** The programme editor is the largest desktop-first surface built since 013.

1. Open the programme editor at **1280px, 900px and 390px**.
2. Confirm no content or primary action requires horizontal scrolling — **the session time grid must
   reflow, not scroll sideways**.
3. Open the delete-versus-cancel confirmation and the overlap warning. **Confirm each dialog is
   centred**, not pinned to the top-left. The base rule in `theme/tokens.css` does this; Tailwind's
   Preflight sets `margin: 0` and takes it away, and 004's and 008's dialogs both shipped
   mispositioned because no behavioural test looks at position.
4. Escape closes each dialog and focus returns to the control that opened it.
5. With a screen reader, confirm the marker is announced **as text** and not conveyed by colour
   alone.

---

## What this walkthrough does not cover

- **Register entry 22** — a cached programme can be up to 24 hours stale, and 014 gives it a second
  way to be wrong. Still filed against 012.
- **The physical iPhone test**, outstanding since 012's scope was set.
- **The outstanding walkthroughs from 007, 008, 009 and 013**, which this one joins rather than
  discharges.
