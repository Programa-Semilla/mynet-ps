# Quickstart: Conference Content Authoring (014)

Nine scenarios. **1–5 a machine can check; 6–9 need a person**, and this project has learned the
difference the hard way — 008's scheduling dialog rendered in the top-left corner having passed 135
e2e tests, five review agents and CodeRabbit, because every one of them checks behaviour and none
looks at where a thing is.

**T-numbers for scenarios 6–9 join the outstanding by-hand walkthroughs from 007, 008, 009 and 013
rather than replacing them.**

---

## Walk record

**Scenarios 1–5: WALKED (T104), 2026-08-12.** Each was walked by running the checks it names rather
than by clicking through, because every one of them is machine-checkable — which is what puts them
in this half of the document. What was executed, and what it proved:

| Scenario | Evidence | Result |
|---|---|---|
| 1 — author a programme | `authoring-programme`, `authoring-isolation` (integration); `profile-uneditable` (unit); `e2e/authoring.spec.ts` — an organizer authors in one browser profile and an attendee reads it in another | pass |
| 1 — the seed survives (FR-1043) | `pnpm db:seed` re-run **twice**; two disjoint programmes (6 and 4 sessions) and the deliberately empty third conference intact | pass |
| 2 — delete only while untouched | `delete-refusal` — 409 with a reason, for each of the four engagement kinds independently, counts only | pass |
| 3 — cancellation preserves everything | `cancel-preserves-state`; `cancelled-session.test.tsx` for the panel, the closed composer and removal from the saved list | pass |
| 3 — reinstatement is silent (FR-1024) | `material-change-dispatch` | pass |
| 4 — Up next skips a cancelled session | `sessions.test.ts` for the asymmetry; `cancelled-session.test.tsx` for both Home cards skipping and `RestOfDay` still listing it marked | pass |
| 5 — the FR-1019a race | `delete-engagement-race` against a real `postgres:17` | pass |

**Scenario 1's "no free colour input" was checked as an absence in two places**, not by looking: the
picker offers exactly the four tokens (`programme-editor.test.tsx`) and no `input[type="color"]`
exists anywhere in the rendered editor.

**Scenarios 6–9 are NOT walked.** They need a person and a phone, and they carry forward — see
T105 and the note at the head of this file.

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

---

# Part II — Tranche 2 scenarios

**Added 2026-08-14.** Scenarios 1–9 above are tranche 1's. These are tranche 2's, and they continue
the numbering. **Scenarios 14–17 need a person and cannot be automated.**

## Scenario 10 — A place is taken, and the last one is contested (US5, FR-1068)

Create an optional session with capacity 2. From three browser profiles, take a place in the same
session at the same moment. **Exactly one of the third pair fails**, and the failure says the session
is full — not that something went wrong. Confirm no place exists beyond the capacity, in every
ordering.

## Scenario 11 — Full and closed are different sentences (FR-1069, FR-1069a, SC-1015)

Fill a session, and separately let a session's closing offset pass. Confirm the two refusals are
**different from each other** and that a reader can tell which happened without a second request.

## Scenario 12 — Enrolment replaces saving (FR-1063, FR-1064, FR-1066)

On an optional session, confirm there is exactly **one** commitment control and that no route exists
to save it. Confirm the session then appears in the Agenda and on the Home card that composes the
attendee's own programme. Confirm no "saved but no place" state is reachable.

## Scenario 13 — A held place is notified, and deletion is silent (FR-1079, FR-1077a, SC-1025)

Take a place, then change the session's room as an organizer: the attendee is notified and the row is
marked. Then delete a different session that has places held: confirm the organizer is shown the
number held **and told those attendees will not be notified**, and confirm nothing reaches them.

**This is the tranche's only irreversible act.** Confirm the confirmation does not say nothing is
attached (FR-1077c).

## Scenario 14 — The roster, and what it must not show *(needs a person)*

As an organizer assigned to the conference, open an optional session and read the names of the people
holding places. Then confirm there is **no** equivalent anywhere for who saved a session, wrote a
note, asked a question or voted. As an organizer **not** assigned to that conference, confirm the
roster is refused identically to a conference that does not exist.

## Scenario 15 — A virtual conference *(needs a person)*

Create a conference, mark it virtual, author a session with a joining link and no room. Confirm the
attendee sees the link and no empty room line. Correct the conference's format afterwards and confirm
it holds. Then attempt in-person → virtual directly and confirm it is refused; route through hybrid.

## Scenario 16 — The vocabulary, empty and then filled *(needs a person)*

With subsector and interest lists empty, complete a profile leaving every taxonomy field blank and
confirm the product works fully. Then, as a platform operator, add a subsector and an interest and
confirm they become selectable **with no deployment**. As a conference organizer, confirm the
vocabulary destination is not reachable at all.

## Scenario 17 — The three widths, and a screen-reader pass *(needs a person)*

The fifth administrative destination and the roster at 390px, 768px and 1280px. The remaining-places
figure on an Agenda row at 390px **without truncating the session title**. Confirm remaining places is
conveyed as text rather than by colour or a bar alone.

## What this walkthrough does not cover

The lock-wait path under real contention, which needs load rather than a walkthrough; and register
entry 4's underlying question, which this escalates rather than answers.
