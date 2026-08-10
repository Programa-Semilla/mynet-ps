# Phase 1 Contracts: Network — Contacts, Exchanged Cards, and Appointments

**Feature**: 008 · **Date**: 2026-08-10

The API contract in `contracts/openapi.json` is **generated and committed** by this project, so this
document states the intended shape and — more importantly — **the guard each route carries and why**.
The route *shape itself* is load-bearing here in a way it has not been in earlier features.

---

## The route split is a security decision, not an organising one

| Family | Path | Guard | Audited by |
|---|---|---|---|
| Cards | `/cards/…` — **names no conference** | `requireHeldCard` → `CardScope` | **`card-audit.test.ts` (NEW)** |
| Appointments | `/events/:eventId/appointments/…` | `requireEventAccess` → `EventScope`, plus a participant condition | `event-scope-audit.test.ts` (existing) |

**Cards name no conference because they are cross-event**, which means `event-scope-audit`
**silently passes** them — it examines a route only if it names an event, and reports success
otherwise. That is the hole 007 found with conversations and closed with a second audit; cards meet
it again, so they get a third.

**Appointments name their event deliberately.** Registering them as `/appointments/:id` would put
them in exactly the blind spot above. The nesting is what places them inside the guarantee that
already exists — do not "tidy" it.

---

## Cards and contacts

### `POST /cards`

Share **your** card with another attendee. One-directional (FR-602).

- Body: `{ attendeeId }` — the recipient.
- `201` on first share; **`200` on a repeat**, returning the existing record with its original
  `sharedAt` unchanged (FR-604). A repeat must not refresh the timestamp, or re-sharing becomes a
  way to signal somebody repeatedly.
- `404` when the recipient shares no current event with the sharer, or does not exist, or is not
  discoverable — **one shape for all of them** (FR-607), inheriting 006's four-way
  indistinguishability.
- `409`, **reasonless**, when either party has blocked the other (FR-608). Same shape as 007's
  blocked send: a reason would confirm the block.
- `400` when the recipient is the sharer (FR-606).
- Throttled as `card_share`, and this action **may deny** (FR-638a).

### `GET /cards/held`

The contacts list — cards the reader holds (FR-617).

- Returns the resolved profile of each sharer, plus `eventName` and `sharedAt` (FR-615).
- **Not** filtered by the active event (cross-event) and **not** filtered by discoverability or
  verification (FR-612, FR-613).
- Excludes any pair with a block in either direction.
- No cursor. The list is bounded by deliberate human acts (spec Assumptions).

### `GET /cards/held/:attendeeId`

One held card.

- `404` when the reader does not hold it — **indistinguishable from it not existing** (FR-616,
  FR-642). A 403 would confirm that a specific person had shared with somebody.
- This is the route the new audit exists for.

### `GET /cards/shared`

Cards the reader has shared. Read-only; there is **no** `DELETE` (FR-618).

---

## Appointments

### `GET /events/:eventId/appointments/slots?attendeeId=`

Slots the reader may offer (FR-625, FR-626).

- Computed from the **reader's** commitments alone. The `attendeeId` names who the meeting is with
  so the surface can be titled; **it must not enter the availability computation.**
- Empty array is a legitimate answer and drives the no-slots state (FR-627).

### `POST /events/:eventId/appointments`

Propose (FR-628).

- Body: `{ inviteeId, slotId, topic }`.
- `400` on empty or whitespace-only topic, or a slot already unavailable to the reader. The client
  keeps the confirm control **disabled** so this is a backstop, not the mechanism (FR-629).
- `404` when the invitee is not registered for this event — which is also why the client offers no
  action at all for a contact absent from the active event (FR-639a).
- `409`, **reasonless**, on a block (FR-637).
- Throttled as `appointment_propose`; **may deny** (FR-638a).

### `GET /events/:eventId/appointments`

Both roles, with `lapsed` **derived** in the response rather than stored (FR-634).

### `POST /events/:eventId/appointments/:appointmentId/accept`

- Invitee only; a proposer attempting it is refused (FR-635).
- `409` with an explanation when the invitee now holds a conflicting commitment (FR-633a). **This
  one carries a reason, deliberately** — it describes the reader's own schedule to the reader, so it
  discloses nothing. Contrast the reasonless 409s above, which would confirm a fact about somebody
  else.
- `404` when the caller is neither participant, indistinguishable from not existing (FR-636).

### `POST …/decline` · `POST …/cancel`

Decline is invitee-only on a pending proposal; cancel is either party on a confirmed appointment.
Both free the affected slots (FR-633), and both are confirmed client-side through the shared
`ConfirmDialog` rather than a second modal (FR-656).

---

## Refusal shapes, gathered

Inherited from 007 and applied consistently. The differences are deliberate:

| Situation | Response | Why |
|---|---|---|
| Card you do not hold | `404` | A `403` confirms two specific people exchanged |
| Appointment you are not party to | `404` | Same reasoning |
| Recipient invisible / absent / nonexistent | `404`, one shape | Four-way indistinguishability, from 006 |
| Blocked share or proposal | `409`, **no reason** | A reason confirms the block |
| Acceptance conflicting with your own schedule | `409`, **with reason** | It is a fact about the reader, told to the reader |

---

## What this feature adds to the contract, and what it must not

**Adds**: the two route families above.

**Must not add**, each asserted by an existing test that fails on violation:

- **Any notification trigger.** `notification-triggers.test.ts` is a source-level audit over
  `apps/api/src` asserting a received message is the only dispatch. **008 does not edit it**
  (FR-643) — the test exists precisely so that a second trigger requires a conversation.
- **Any card mutation or revocation route** (FR-618).
- **Any route creating or editing a meeting slot** (FR-623, Principle III).
- **Any column on `attendees`.** The contact line was withdrawn; a card carries exactly the
  directory profile (FR-619–FR-622).
