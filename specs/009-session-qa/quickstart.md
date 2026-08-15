# Quickstart Validation: Session Q&A

**Feature**: 009 · **Date**: 2026-08-10 · **Spec**: [spec.md](./spec.md)

A by-hand walkthrough proving the feature works end to end. **Read this first:** T148 — this
walkthrough — was **not completed for 007 and not completed for 008**, and both shipped without it.
The one time a human did look at 008, they found a scheduling dialog rendering in the **top-left
corner of the viewport**, having passed 135 end-to-end tests, five review agents and CodeRabbit.

**Layout and focus are the part of this product no automated gate examines.** Scenario 6 exists
because of that, and research R2 says in advance that this feature's sharpest risk — two dialogs
opening inside a modal panel — is invisible to jsdom. Do not skip it.

## Prerequisites

- `pnpm install`
- `pnpm start` — the dev servers. The service worker registers in dev too (007), so nothing here
  needs a production build.
- A seeded database with at least two attendee accounts registered for the same event. Nothing in
  this feature is seeded (FR-762), so **every session starts with an empty Q&A** — which is the
  point: the first thing you see is the empty state.
- **Two browser profiles**, not two tabs. The whole feature is about what one attendee sees of
  another, and one session cookie cannot demonstrate it.

Call the two attendees **A** and **B** throughout.

---

## Scenario 1 — Ask, and be seen (US1)

1. As **A**, open Agenda and open any session's detail panel.
2. Confirm the Q&A section is present, beneath the existing sections, and shows the **empty state
   inviting the first question** — not a spinner, not a blank area.
3. Confirm the post control is **disabled**. Type a single space; confirm it is still disabled.
   *(FR-704 — never enabled-then-rejected.)*
4. Type a question. Confirm the remaining allowance becomes visible **before** you reach 500
   characters, not at it (FR-706).
5. Paste more than 500 characters. Confirm the control disables again.
6. Post a valid question. Confirm it appears in the list attributed to **A's display name**, and the
   field clears.
7. As **B**, open the same session. **Confirm the question is visible, with A's name.**

**Expected**: a question crosses between two accounts, attributed, with no page reload.

---

## Scenario 2 — Ranking (US2)

1. As **B**, post a second question on the same session.
2. As **B**, upvote **A's** question. Confirm the count rises to 1 and the control shows a voted
   state.
3. Confirm **A's** question is now **above** B's own (FR-725).
4. Activate the upvote again. Confirm the vote is withdrawn and the count returns to 0.
5. Upvote again, then **reload**. Confirm both the count and the voted state survived.
6. Confirm **B cannot upvote B's own question** — the control is unavailable (FR-722).
7. As **A**, confirm the same list in the same order. Two readers, one ranking (SC-705).

**Expected**: one vote per attendee, reversible, durable, and the order is the same for everyone.

---

## Scenario 3 — Withdrawal, and its cut-off (US3)

1. As **A**, post a fresh question. Confirm a withdrawal control is offered on it and on no other.
2. Activate it. Confirm **a confirmation is required** before anything is removed.
3. Confirm. Confirm the question is gone — and gone for **B** too.
4. As **A**, post another. As **B**, upvote it.
5. As **A**, reload and confirm the withdrawal control is now **absent with the reason stated** —
   not present and failing (FR-713).
6. As **B**, withdraw the vote. As **A**, reload: withdrawal is available again (Edge Cases).

**Expected**: retraction exists, and stops existing the moment somebody else has backed the question.

---

## Scenario 4 — Report, and disappear (US5)

1. As **B**, find a question by **A** and report it **from the question itself**. Confirm you did
   **not** have to open a conversation with A to get here (SC-711a) — this is the whole point of
   FR-781.
2. Confirm the confirmation is **disabled while the reason is blank**.
3. Submit. Confirm:
   - the question is **gone from B's view**;
   - **every other question by A** is also gone from B's view (FR-785);
   - **A is blocked** — B was not asked to block separately (FR-782).
4. As **A**, open the same session. Confirm **B's** questions are gone from A's view too — the
   invisibility is bidirectional.
5. As a third account if you have one, or by inspecting the API response: confirm the question is
   **unchanged** for everyone else, **with its count unchanged** (FR-787, SC-711b).
6. As **B**, unblock **A**. Confirm A's questions **reappear with no other action** (FR-786).
7. Confirm there is **no screen anywhere** that shows the report back (FR-773a).

**Expected**: reporting removes and protects without becoming moderation, and reverses cleanly.

---

## Scenario 5 — Leaving (US4)

1. As **A**, ask a question. As **B**, upvote it. As **A**, also upvote one of **B's** questions.
2. As **A**, export your data. Confirm the export contains **the question you asked** and **the vote
   you cast**, each naming its session (FR-764).
3. As **A**, delete the account.
4. As **B**: confirm A's question is gone from the session, that **B's vote on it is gone**, and that
   the count on B's own question has dropped by one.
5. Confirm no placeholder, no "former attendee", and no de-attributed row anywhere (decision 1).
6. Open a session whose only question was A's. Confirm the **empty state**, not a gap or an error.

**Expected**: hard deletion, cascading both ways, with the stated cost visible — other people's
votes went with it.

---

## Scenario 6 — Layout, focus and the two dialogs

**The scenario every previous feature skipped. Do it in a real browser at all three widths.**

1. **Desktop (≥1280px)**: open a session panel with several questions. Confirm the panel is
   **centred**, not pinned to a corner. Confirm nothing scrolls horizontally.
2. Open the **withdrawal confirmation** from inside the panel. Confirm it is **centred**, above the
   panel, and that the panel behind it is visibly inert.
3. Press **Escape once**. Confirm **only the confirmation closes** — the panel stays open and the
   address still names the session (research R2). Confirm focus returned to the control that opened
   it.
4. Press **Escape again**. Now the panel closes and focus returns to the row that opened it.
5. Repeat steps 2–4 with the **report dialog**.
6. **Tablet (~834px)**: confirm the reduced rail, the panel's constrained width, and a
   **single-column** question list.
7. **Mobile (390×844 — the prototype's frame)**: confirm the panel is **full-width from the bottom
   edge**, bottom navigation is present, vote and withdraw controls are at touch size, and a long
   question **wraps** rather than forcing horizontal scroll.
8. **Keyboard only, at each width**: Tab through ask → post → upvote → withdraw → confirm. Confirm
   **every** focus position is visible and nothing is reachable only by pointer.
9. **Upvote a question that will move up the list.** Confirm the focus stays on the control you just
   activated as the row moves (FR-780, research R5). This is the assertion most likely to fail.

**Expected**: two nested modals behave, and nothing is in the wrong place.

---

## Scenario 7 — Offline

1. Load a session panel while online.
2. Go offline (DevTools, or stop the API).
3. Confirm the Q&A section shows a **failure distinguishing absence of connection** from a fault on
   our side (FR-728) — Q&A is **not cached**, so there is nothing to show and the section must say
   so rather than showing an empty list.
4. Confirm the rest of the panel — overview, speakers, notes — **still renders** (FR-729, SC-715).
5. Type a question and try to post. Confirm it is **refused with an explanation, never queued**, and
   that **your typed text is still there** (FR-758, FR-759).
6. Try to vote. Confirm refusal and that no count changed locally.
7. Come back online. Confirm the cached programme, saved sessions and notes are **still there** —
   asking and voting must not have purged them (FR-756, SC-711). *This is the assertion 008's
   equivalent defect would have failed.*

**Expected**: honest refusal, nothing lost, and no collateral damage to other features' caches.

---

## Scenario 8 — Scoping and refusals

1. As **A**, note a question id from event **E1**.
2. Register **A** for a second event **E2** and switch to it.
3. Address the E1 question through an E2 URL. Confirm the refusal is **indistinguishable** from a
   question that does not exist (FR-743) — no wording that admits E1 has such a question.
4. As **B**, attempt to withdraw **A's** question directly via the API. Confirm it is refused
   server-side regardless of what any interface offered (FR-715).
5. Confirm switching events swaps the Q&A entirely — a question is per-event and does not follow you.

**Expected**: server-side authorization, and refusals that disclose nothing.

---

## Automated gates

Run before claiming completion. **Completion is claimed from pipeline output, never from
inspection** (Principle VII).

```bash
pnpm typecheck && pnpm lint
pnpm test:unit && pnpm test:component
pnpm contract:check          # a route without a `schema` block is silently absent
pnpm test:integration        # against a real postgres:17
pnpm test:e2e
pnpm build
```

**Three that must pass *unmodified*, and modifying one is the conversation rather than the fix:**

- `apps/api/tests/unit/notification-triggers.test.ts` — a received message stays the only trigger.
- `apps/api/tests/unit/no-report-read-surface.test.ts` — nothing reads a report back.
- `apps/api/tests/unit/deletion-coverage.test.ts` and `export-coverage.test.ts` — both new tables
  fail these **by existing** until declared.

**And one to watch**: `e2e/responsive.spec.ts` measures dialog centring. It gained that assertion
because two dialogs shipped in the corner; this feature opens two more.
