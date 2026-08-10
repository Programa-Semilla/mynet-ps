# Phase 1 Contracts: Session Q&A

**Feature**: 009 · **Date**: 2026-08-10

The API contract in `contracts/openapi.json` is **generated and committed** by this project, so this
document states the intended shape and — more importantly — **the guard each route carries and why**.

---

## Every route names its conference, and that is the whole security design

| Path | Method | Guard | Audited by |
|---|---|---|---|
| `/events/:eventId/sessions/:sessionId/questions` | `GET` | `requireEventAccess` → `EventScope` | `event-scope-audit.test.ts` (**existing**) |
| `/events/:eventId/sessions/:sessionId/questions` | `POST` | `requireEventAccess` | existing |
| `/events/:eventId/questions/:questionId` | `DELETE` | `requireEventAccess` + authorship | existing |
| `/events/:eventId/questions/:questionId/vote` | `POST` | `requireEventAccess` | existing |
| `/events/:eventId/questions/:questionId/vote` | `DELETE` | `requireEventAccess` | existing |

**This feature introduces no new branded scope and no new route audit, and that is an outcome rather
than a saving.** 007 needed `ConversationScope` because a conversation is cross-event with two
owners; 008 needed `CardScope` because a card names no conference. A question always belongs to a
session and a session belongs to exactly one event — so `EventScope` reaches it, **provided the
address says so**.

The last three rows are the ones to look at. `/events/:eventId/questions/:questionId` names an event
it does not strictly need in order to find the question. **Do not "tidy" it to
`/questions/:questionId`.** `event-scope-audit` examines a route only if it declares an event
parameter and **reports success otherwise**, so the tidied version would ship unguarded with a green
gate — which is precisely what 007 and 008 each had to build an audit to catch. Here the constraint
is met by naming, at zero cost, and 008's own comment correcting 007's prediction is the precedent.

The event in the path is also *checked*, not decorative: the question must belong to a session in
that event, or the response is the indistinguishable refusal below.

---

## Reads

### `GET /events/:eventId/sessions/:sessionId/questions`

Returns the session's questions, ordered by vote count descending and ask time ascending.

```
200 → { questions: [ { id, body, askedAt, authorId, authorDisplayName,
                       votes: number, votedByMe: boolean, canWithdraw: boolean } ] }
```

- `votes` is computed, never stored.
- `votedByMe` is the reader's own state. **There is no field naming any other voter**, and no route
  returns one (FR-721, FR-769).
- `canWithdraw` is `authorId === reader && votes === 0`. It is sent rather than derived on the client
  so the control's absence and the server's refusal cannot disagree — but it is **not** the
  enforcement, which is FR-715 and lives in the `DELETE` handler.
- `authorDisplayName` is present for **every** question, including one by an attendee who has turned
  discoverability off (FR-734). Opening that author's profile still refuses, from the existing
  profile route, unchanged (FR-736).
- Questions by an attendee blocked in **either** direction are absent from this list (FR-785). Their
  votes are still in every other reader's `votes` (FR-787).

---

## Writes

All four write routes return **the full re-ordered list**, in the same shape as `GET` (research R5).
This is deliberate: it is what makes the reader's own action update immediately (FR-730) without a
second round trip in which the count could change again.

### `POST …/questions` — ask

```
body → { body: string }        1–500 characters after trimming
201  → { questions: [...] }
```

- `400` for an empty or over-length body. **The interface disables the control instead** (FR-704),
  so a `400` here means the form was bypassed — the same reasoning 007 records for the report
  reason.
- Throttled on `question_ask`, keyed on the authenticated attendee, `mayDeny: true` (research R8).

### `DELETE /events/:eventId/questions/:questionId` — withdraw

```
204  → no content
```

- `403` **with a reason** when the question now has a vote (FR-714). This is one of only two refusals
  in this feature that explains itself, and it is safe because it describes the **reader's own
  question to the reader**. The condition is re-checked inside the same transaction as the delete;
  checking before it is the race the requirement exists to close.
- `404` when the question is not the caller's, is in another conference, or does not exist —
  **indistinguishable**, see below.

### `POST …/questions/:questionId/vote` — upvote · `DELETE …/vote` — withdraw the vote

```
200  → { questions: [...] }
```

- **Idempotent by the composite primary key** (FR-718), so a double-tap on a slow connection is the
  same request twice.
- `403` when the caller is the author (FR-722). Safe to explain, for the same reason as withdrawal.
- Throttled on `question_vote` — an order of magnitude looser than asking, because a reader working
  down a long list is the normal case.

---

## Refusals

**The default shape is `404`, and it is indistinguishable by construction.** A question in a
conference the reader is not registered for, a question on a session in another conference, and a
question that does not exist all answer identically (FR-743). This follows 002's refusal shape for
sessions and 007's for conversations: a `403` would confirm the thing exists.

**Two refusals deliberately carry a reason** (FR-744), and both pass the same test — *the follow-up
question is about the reader, not about anybody else*:

| Refusal | Why explaining is safe |
|---|---|
| Withdrawal refused because a vote exists | Describes the reader's own question, and the vote count is already on their screen. |
| Vote refused because the caller is the author | Describes the reader's own authorship, which they already know. |

008's enumeration-oracle defect is the thing being avoided: asking whether the *invitee* was
registered, to choose between `400` and `404`, made the caller-controlled slot the only fixed
variable and turned the route into a presence oracle. Nothing here branches on a fact about another
attendee.

**Client-side, every one of these is classified by `error.code`, never by `instanceof`** (FR-745).
`ApiError extends RequestRefusedError` and every non-2xx throws `ApiError`, so a class check catches
`400`, `404`, `429` and `500` alike — which in 008 rendered the deliberately reasonless refusal for
all of them and swallowed the messages these routes are written to deliver.

---

## Reporting — one existing route, one new field

`POST /reports` is 007's, unchanged in every respect that matters. It gains one optional field.

```
body → { attendeeId, reason, messageIds?, questionIds? }
204  → no content
```

- The route still **blocks the reported attendee in the same act**, protection first (FR-782).
- Operator mail still carries **identifiers and a timestamp only** — never the question text and
  never the reporter's reason (FR-784).
- There is still **no route that reads a report back**, and
  `tests/unit/no-report-read-surface.test.ts` must keep passing **unmodified** (FR-773a).
- **New**: throttled on `report_submit` (research R8). This closes a gap 007 left rather than one 009
  opens — a report dispatches operator mail, so unthrottled reports are unthrottled mail to the one
  safety channel the product has.

---

## What is absent from this contract, on purpose

- **No route dispatches a notification.** The existing source-level audit over `apps/api/src` must
  keep passing **unedited**; editing it to admit a Q&A trigger is a constitution amendment, not an
  implementation detail (FR-747).
- **No edit route and no `PATCH`** (FR-709, FR-770). Withdrawal is the only retraction.
- **No downvote and no reaction** (FR-723, FR-771).
- **No route returns who voted** (FR-721, FR-769).
- **No answer, no `answered` flag, no pin, no moderation route** (FR-768) — each is an organizer act.
- **Nothing is added to `CatalogRepository`** or to any catalog route (FR-710, FR-772).
