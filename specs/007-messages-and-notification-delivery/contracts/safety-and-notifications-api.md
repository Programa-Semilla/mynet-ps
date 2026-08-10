# Contract: block, report, and notification delivery

**Feature**: 007 | **Date**: 2026-08-07

Companion to [`messages-api.md`](./messages-api.md). Five new routes, plus two extended ports that
are not HTTP surfaces but belong on this page because they are contracts all the same.

**One route is conspicuously absent, and its absence is a requirement.** There is no
`GET /reports`, no `GET /reports/{id}`, and no administrative surface of any kind. FR-548 forbids any
interface, role or route by which a report can be read from within this product. A reviewer looking
for the missing half of the report feature should find nothing, and finding nothing is the pass
condition (SC-508).

---

## `POST /blocks` — NEW

```jsonc
{ "attendeeId": "uuid" }
```

### 204

Idempotent. Blocking someone already blocked succeeds and changes nothing, so a double-tap on a
confirmation cannot produce an error the attendee has to interpret.

Takes effect immediately (SC-506): the next send by the blocked attendee is refused, whether or not
they have the thread open.

**Blocking deletes nothing** (FR-538). The blocker keeps the history.

### 404 — no such attendee

### 400 — attempting to block yourself

---

## `DELETE /blocks` — NEW

> ### ⚠️ Amended during implementation. **This page originally wrote it as
> `DELETE /blocks/{attendeeId}`, and that shape fails a shipped guard.**
>
> `tests/unit/event-scope-audit.test.ts` forbids outright any route naming an attendee identifier
> in its URL with a write method: *"a write route naming an attendee is a route that can act on
> somebody else"* (FR-385). 004 narrowed 001's rule to permit a **read** naming an attendee — under
> the event guard and behind three server-side conditions — and explicitly kept writes closed.
> Unblocking is a write.
>
> So the target moves into the body, which is the shape the two neighbouring routes already use:
> `POST /blocks` above, and `DELETE /push/subscriptions` below. The audit caught this rather than a
> reviewer, which is the audit working.

```jsonc
{ "attendeeId": "uuid" }
```

Unblock. **204**, idempotent in the same way.

Directional (FR-540): this releases only the caller's block. If the other attendee also blocks the
caller, that row is untouched and the caller is not told it exists.

---

## `GET /blocks` — NEW

The management surface FR-541 requires, served to the block's owner only.

### 200

```jsonc
{
  "blocks": [
    {
      "attendeeId": "uuid",
      "displayName": "string",
      "avatar": { "contentType": "string", "base64": "string" },  // or null
      "blockedAt": "2026-08-07T09:00:00Z"
    }
  ]
}
```

Empty array is not an error — it is the "you have not blocked anyone" state FR-541a declares.

**This route projects the blocked attendee's name and avatar**, which is the one place this feature
discloses a profile detail outside a conversation. It is bounded: the caller already knows exactly
who these people are, having blocked them by hand, and a list of opaque identifiers would be
unusable for the one action it exists to support.

---

## `POST /reports` — NEW

```jsonc
{
  "attendeeId": "uuid",
  "reason": "string",           // non-empty
  "messageIds": ["uuid"]        // the reported messages
}
```

### 204

**Three things happen, in this order, and the order is the requirement:**

1. The reported attendee is blocked (FR-544). The attendee's protection lands first.
2. The report row is written.
3. Operator mail is dispatched (FR-547).

**Step 3 failing does not fail the request** (FR-549). The dispatch is wrapped exactly as
verification mail is — the failure is logged, honestly and visibly, and the caller still gets 204,
because an unprovisioned mail provider is the expected state (research R8) and safety must not
depend on an external service succeeding.

### 400 — empty reason

The client disables the confirmation while the reason is empty (FR-546), so this is a backstop.

### What the response cannot say

Nothing about what happens next. There is no case identifier to quote, no status to poll, and no
route that would answer either. The product's honest position is that a human will look at the mail;
promising more inside the application would be promising a review surface that FR-548 forbids
building.

---

## `POST /push/subscriptions` — NEW

Register this device for delivery.

```jsonc
{
  "endpoint": "string",
  "keys": { "p256dh": "string", "auth": "string" }
}
```

### 201 / 200

201 on a new endpoint, 200 when the same endpoint re-registers — the unique constraint on `endpoint`
makes re-subscription a replacement rather than an accumulation, and a browser that renews its
subscription must not leave a dead row behind.

**The endpoint is bound to the calling attendee's session.** A device signed into a different account
that re-registers the same endpoint reassigns it, so one browser profile cannot deliver one
attendee's messages using another's registration.

### 400 — malformed subscription

---

## `DELETE /push/subscriptions` — NEW

```jsonc
{ "endpoint": "string" }
```

**204**, idempotent. Drops this device only; every other device the attendee has registered is
unaffected (FR-556).

Not called on sign-out. A subscription is per device, not per session (FR-555).

---

## Extended port: `NotificationService` *(client, not HTTP)*

`packages/platform/src/interfaces/index.ts`. Three members are added; the existing three keep their
signatures.

```
subscribe(): Promise<DeviceSubscription | null>
unsubscribe(): Promise<void>
currentSubscription(): Promise<DeviceSubscription | null>
```

`DeviceSubscription` is a domain shape — `{ endpoint, keys: { p256dh, auth } }` — **not** the
browser's `PushSubscription` object. Passing the browser type through the port would leak a platform
type into every consumer and defeat `mynet/no-direct-platform-access`, whose violation count SC-008
requires to be zero.

**The interface's existing comment must be rewritten in the same change.** It currently states that
the implementation "MUST NOT be wired to real delivery" — a restatement of register entry 10, which
M4 reverses. Leaving it above a real implementation would make the file contradict itself.

**This change is gated on the constitution amendment**, not on the push provider.

---

## Extended port: `MailService` *(server, not HTTP)*

`apps/api/src/mail/service.ts`. One method is added to an interface that deliberately has exactly
two.

```
sendAbuseReport(to: string, report: {
  reportId: string
  reportedAt: string
  messageIds: readonly string[]
}): Promise<void>
```

That file's header states the interface has two methods *so that adding a third requires editing
it*. The guard worked; this is the deliberate act it was designed to force, and the justification is
recorded rather than assumed:

- The guard exists to keep **engagement notifications to attendees** out. This message goes to the
  **operator** and is operational. It is not addressed to a user of the product.
- **It carries identifiers and a timestamp, never message text and never the reason string.** Putting
  reported content into email would copy two attendees' personal data into an external provider's
  systems and into an inbox with its own retention — for a recipient who can query the database
  directly. The mail says *a report exists, here is its identifier*.
- There is still **no generic `send`**. A fourth message would require editing the file again.

**Gated on the operator address** (spec open question 3) for configuration only. The method, the
record and the block are all buildable and testable now against the sink adapter.

---

## New server port: `PushService`

`apps/api/src/notifications/service.ts`, mirroring `apps/api/src/mail/` — port, dispatch wrapper,
sink adapter (research R8).

```
send(subscription: StoredSubscription, payload: {
  title: string
  body: string          // truncated to fit the ~4 KB encrypted payload budget
  conversationId: string
}): Promise<'delivered' | 'gone' | 'failed'>
```

`'gone'` is a distinct result rather than an error because FR-557 requires the subscription to be
**discarded** on permanent failure — the caller needs to tell "this device is finished" from "try
again later", and an exception would flatten the two.

`body` carries message content per M7, truncated where necessary. Research R12 sets the message
limit at 2,000 characters partly for this reason.

**No vendor appears in this interface.** Spec open question 2 blocks only the real adapter.
