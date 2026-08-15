# Contract: conversations and messages

**Feature**: 007 | **Date**: 2026-08-07

The generated, committed contract is `contracts/openapi.json` at the repository root, built by
Swagger from the Fastify route schemas as they register. **This file is the intent**; that file is
the artifact, and CI fails when they disagree.

**Six new routes, none of them under `/events/{eventId}`.** That absence is the single most
important thing on this page. Conversations are cross-event (FR-507), so `requireEventAccess` does
not apply — and because these routes name no conference, `tests/unit/event-scope-audit.test.ts`
**will pass them without inspecting anything**. A new audit and a new branded scope replace it; see
*Guards*, below.

---

## Guards — read before any route

Every route here carries two guards:

1. **`requireAttendee`** — binds identity from the sign-in session. No route on this page accepts an
   attendee identifier in a path, query or body (FR-525). The 001 rule is unchanged.
2. **`requireParticipation`** — resolves the acting attendee's `conversation_participants` row and
   returns a branded `ConversationScope`. **The query layer accepts nothing else**, so a handler
   that skipped the guard has nothing to pass and cannot read a message.

`tests/unit/participation-audit.test.ts` walks the real route table and fails the build for any
route accepting a conversation or message identifier without the second guard — the same mechanism
`event-scope-audit.test.ts` provides for conferences, for the predicate it cannot see (research R9).

**Refusal is uniform.** A conversation that does not exist and a conversation the caller does not
participate in both answer **404**, with the same body. A 403 would confirm existence, and FR-524
forbids disclosing anything about a conversation the caller is not in — including that it is there.

---

## `GET /conversations` — NEW

The conversation list. Not paginated: an attendee has tens of these, and FR-508's ordering is over
the whole set.

### 200

```jsonc
{
  "conversations": [
    {
      "conversationId": "uuid",
      "counterpart": {                    // null when the other participant deleted their account
        "attendeeId": "uuid",
        "displayName": "string",
        "avatar": { "contentType": "string", "base64": "string" }  // or null
      },
      "lastMessage": {                    // null only for a one-sided conversation with no surviving messages
        "body": "string",                 // the preview
        "sentAt": "2026-08-07T09:00:00Z",
        "mine": true
      },
      "unread": true,
      "state": "open" | "one_sided" | "blocked"
    }
  ]
}
```

`counterpart: null` is how a departed participant is represented (FR-573). **There is no name, no
avatar and no identifier** — nothing is retained to send. The client renders the closed-thread
treatment from `state`, not from a missing field.

`state` is derived per the data model's transition table, never stored. `blocked` means *this
attendee blocks the counterpart* — the reverse case is invisible here, deliberately (FR-537).

`unread` is a boolean, not a count. FR-531 needs existence and nothing on this page needs more.

### 401 — not signed in

---

## `GET /conversations/{conversationId}/messages` — NEW

A keyset page of history, newest first. The client reverses for display.

| Query parameter | Type | Notes |
|---|---|---|
| `cursor` | string, optional | Opaque. Encodes the previous page's last `(sentAt, id)` |
| `limit` | integer, optional | Default 50, bounded server-side |

### 200

```jsonc
{
  "messages": [
    { "messageId": "uuid", "body": "string", "sentAt": "2026-08-07T09:00:00Z", "mine": false }
  ],
  "nextCursor": "string | null",
  "state": "open" | "one_sided" | "blocked"
}
```

**No author identifier is projected — only `mine`.** The counterpart is already established by the
conversation; sending their identifier per message would add nothing and widen the surface.

Unlike 006's directory cursor, this one is over immutable `sent_at` values, so it guarantees **no
duplicates and no omissions** (research R6).

### 404 — no such conversation, or the caller does not participate in it

Indistinguishable, per *Guards*.

---

## `POST /conversations/{conversationId}/messages` — NEW

Send into an existing conversation.

```jsonc
{ "body": "string" }   // 1–2000 characters after trimming
```

### 201

```jsonc
{ "messageId": "uuid", "sentAt": "2026-08-07T09:00:00Z" }
```

### 400 — empty, whitespace-only, or over 2,000 characters

The client disables send below the lower bound (FR-512) and shows a counter approaching the upper
one (FR-517), so this is a backstop rather than the normal path.

### 403 — the conversation is closed to sending

Returned when the counterpart has deleted their account (FR-574). Distinguishable from a block on
purpose: this is a fact about a conversation the caller can already see, not a disclosure about
another attendee.

### 409 — refused

**The single response for "the recipient blocks you".** It carries no reason, and it is deliberately
the same shape a generic conflict would take, because FR-537 forbids disclosing that a block exists.
A sender learns their message did not send, never why.

### 429 — throttled

`message_send` is configured `mayDeny: false` (research R5), so this always carries `retry-after`
and always clears. **A send is delayed, never denied.**

---

## `POST /conversations` — NEW

Open a conversation by sending its first message. **This is the only route that creates one**, and
it does both in one transaction — there is no route that creates an empty conversation, because
FR-503a says none exists until a message is sent.

```jsonc
{ "attendeeId": "uuid", "body": "string" }
```

`attendeeId` names the **recipient**, never the caller. This is the same narrowing exception 004 and
006 recorded: an identifier that only selects a target, on a route whose actor is fixed by the
session.

### 201

```jsonc
{ "conversationId": "uuid", "messageId": "uuid", "sentAt": "2026-08-07T09:00:00Z" }
```

### 200 — the conversation already existed

Returned instead of 201 when the pair already has a conversation: the message is appended to it and
its identifier is returned. FR-510 requires that a second conversation is never created, and the
unique constraint on `conversation_pairs` is what enforces it — the handler catches the violation
and appends rather than checking first, so two simultaneous first messages cannot both create.

### 404 — no such attendee, or no shared event

**Indistinguishable, and that matters more here than anywhere else on this page.** Distinguishing
them would turn this route into an oracle for "is this identifier a real attendee", against a
world-readable repository and public sign-up. FR-504's co-attendance condition is checked here and
never again (FR-505).

### 409 — refused

The recipient blocks the caller (FR-536). Same shape and same silence as above.

### 429 — throttled

`conversation_create` is configured **`mayDeny: true`** — the one throttle in this feature that
genuinely refuses. Research R5: it is keyed on the caller's own authenticated identity, so a denial
can only harm the caller, and bounding how many distinct people one account opens conversations with
is the whole point of FR-504a.

---

## `PUT /conversations/{conversationId}/read` — NEW

Advance the caller's own read position (FR-528).

```jsonc
{ "throughMessageId": "uuid" }
```

### 204

Idempotent, and **monotonic**: a request naming an older message than the current position is
accepted and changes nothing. Without that, an out-of-order arrival could silently mark a
conversation unread again.

**Writes only the caller's own participant row.** There is no route, and no field on any response,
by which one attendee learns another's read position (FR-530).

---

## `GET /conversations/unread` — NEW

Home's indicator (FR-531), as its own cheap question.

### 200

```jsonc
{ "hasUnread": true }
```

A boolean, not a count, and a separate route rather than a field on `GET /conversations` — because
the Home card must not transfer the whole conversation list to render a dot, and standing decision 9
requires it to own its own loading and failure states independently of any other surface.

---

## What none of these routes can say

- **That a conversation exists, to anyone not in it.** 404 is uniform (FR-524).
- **That a block exists, to the blocked attendee.** 409 carries no reason (FR-537).
- **When anyone read anything.** No read position is ever projected for another attendee (FR-530).
- **Anything at all about presence, typing, or delivery** (M5).

---

## Contract regeneration

`pnpm --filter @mynet/api contract:generate` rewrites `contracts/openapi.json` from the registered
route schemas. The `contract` CI job fails when the committed file and the generated one differ.
