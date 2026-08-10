# Quickstart: validating 007

**Feature**: 007 | **Date**: 2026-08-07

How to prove Messages and notification delivery actually work. Scenario numbers map to the spec's
user stories; contract details live in [`contracts/`](./contracts/) and schema details in
[`data-model.md`](./data-model.md) rather than being repeated here.

---

## Prerequisites

**Two accounts.** Every scenario in this feature needs two, because every guarantee is about two
people who are not interchangeable. A single-account walkthrough proves almost nothing here — it
cannot exercise participation, unread, block, or M3.

### One command

```bash
git config core.hooksPath .githooks     # once per clone
pnpm install
pnpm start
```

`pnpm start` is the whole setup. It creates `.env` with generated secrets if there is none, starts
the `mynet-pg` container, **applies migrations and runs the seed by itself**, and runs the API and
the client. Do not run `pnpm db:migrate` or `pnpm db:seed` separately — they are what it calls.
It is idempotent: run it again any time. `pnpm start --reset` rebuilds the database from zero, which
is how you get back to a clean slate after a walkthrough that deleted accounts.

It prints what you need:

```
  MyNet is running

  →  http://localhost:5173

     branch    feat/007-messages-and-notification-delivery
     instance  mynet-ps
     database  mynet_ps on localhost:55432
     api       http://localhost:3000

  Sign in as ada@example.com or grace@example.com
  password: correct-horse-battery-staple
```

**A is `ada@example.com` and B is `grace@example.com`** throughout this document, and **Alan
Turing is the third party** — see *Who the seed gives you* below, which is worth reading before you
start, because each account's differences are load-bearing.

Sign in as each in a **separate browser profile**, not two tabs. They share a session cookie
otherwise, and the whole feature is about telling two identities apart — a walkthrough that gets
this wrong appears to work and proves nothing.

> **A private or incognito window is NOT a second profile for this purpose**, and scenario 5 is
> where that bites. It is fine for scenarios 1–4 and 6: separate cookie jar, separate identity,
> everything works. But **a private window cannot hold a push subscription** — Chrome's incognito
> mode refuses one and Firefox's private browsing disables service workers entirely — so the
> attendee in it can never *receive* a notification.
>
> The trap is that it looks like it worked: the explanation card appears, the browser prompt
> appears, permission is granted. **Permission and a subscription are two different things**, and
> only the second one failed. Nothing lands in `push_subscriptions`, so a message sent to that
> attendee dispatches to nobody and the feature reads as broken.
>
> Use a real second profile (Chrome menu → *Add*), or better, a second **browser** — Chrome for
> one and Firefox for the other, which exercises both FCM and Mozilla autopush rather than one
> push service twice.

### Who the seed gives you

Three accounts, and their differences are the fixtures. All three are on **Product & Design Summit**
(join code `PDS-2026`).

| | Also registered for | Verified | Discoverable | Conversations |
|---|---|---|---|---|
| **Ada Lovelace** `ada@example.com` | Frontend Horizons | yes | yes | one, with Grace |
| **Grace Hopper** `grace@example.com` | Systems & Scale | yes | yes | one, with Ada |
| **Alan Turing** `alan@example.com` | — | **no** | **no** | **none** |

Three consequences worth knowing before you start, because each one makes a scenario below work:

- **Ada and Grace already have a conversation** (T144, so a fresh clone does not open on an empty
  destination). That is why scenario 1 uses **Alan**: he is the only account for which "no
  conversation exists yet" is true.
- **Alan is unverified, so he appears to nobody** — but he sees everybody, and he can message
  anybody. Verification gates discoverability and nothing else, so he is a complete attendee who is
  invisible. He is also the third party for the authorization checks, with no sign-up needed.
- **Ada and Grace are each registered for two conferences**, which is what makes the event-switch
  check in scenario 2 possible.

### Reading the database

Several steps below check a table directly. Use the database name the banner printed:

```bash
docker exec -it mynet-pg psql -U mynet -d mynet_ps
```

```sql
select * from conversations;
select * from conversation_pairs;
select * from conversation_participants;
select id, conversation_id, author_id, left(body, 40), sent_at from messages order by sent_at;
select attendee_id, endpoint, last_delivered_at from push_subscriptions;
select blocker_id, blocked_id, created_at from attendee_blocks;
select id, reporter_id, reported_id, reason, message_ids, created_at from abuse_reports;
```

### Watching the two sinks

**Mail has no provider; push does.** Keep the API's terminal output visible — it is the instrument
for scenarios 3 and 5.

- **Mail** still records rather than sends (register entry 18). The sink prints a boxed
  `development mail sink` banner naming the report identifier and how many messages it cited. That
  banner is development-only.
- **Push delivers for real once VAPID keys are set**, and records otherwise. The API chooses by
  configuration alone — keys present, `WebPushService` signs and POSTs to the browser's own push
  service; keys absent, `SinkPushService` logs
  `push RECORDED by the development sink — not delivered to a device`. **The same rule applies in
  every environment**, so a local end-to-end test is the production path rather than a special mode.

Either way the send path logs one `push fan-out complete` line with `delivered` / `failed` / `gone`
counts. Counts only: an endpoint is a bearer value and a message body is content, so neither belongs
in a deployed environment's log.

### Turning notifications on locally

Scenario 5 needs a VAPID pair. **With none configured the client's `isSupported()` is `false` by
design** — no permission is requested, the explanation surface never appears, and scenario 5's first
steps cannot be walked at all. That is the correct behaviour for an unconfigured deployment and it
is useless for validating the feature.

```bash
npx web-push generate-vapid-keys
```

Then, **after the first `pnpm start` has created `.env`**, stop it and add three lines to that file:

```dotenv
PUSH_VAPID_PUBLIC_KEY=<the public key>
PUSH_VAPID_PRIVATE_KEY=<the private key>
VITE_PUSH_VAPID_PUBLIC_KEY=<the same public key>
```

Restart `pnpm start`. Edit `.env`, **not `.env.local`** — the latter is rewritten on every start.
That is the whole setup: the dev server registers the service worker too, so **one terminal is
enough** and scenario 5 needs nothing further.

Three things to know before you begin:

1. **They must be one pair.** Nothing checks that they match. A mismatch lets a device subscribe
   with one key while the server signs with another, and **every delivery is then rejected while
   every screen still looks correct** — the nastiest failure in the feature. It is at least visible
   now: the push service answers `403`, and the API log names it as a VAPID key mismatch rather than
   filing it under "failed".
2. **The API refuses to start with only one of them set.** That combination would boot, hand the
   client a public key, let devices subscribe, and then fail at signing — after the attendee had
   been told notifications were on.
3. **These keys are local only.** Who holds a real pair per environment is register entry 20 and is
   not settled by using one here.

**Notifications need `localhost` or HTTPS.** Web Push is unavailable on an insecure origin, so a
phone on the LAN pointed at this machine's IP will correctly report `isSupported() === false`. That
is the FR-552 fallback working, not a broken setup.

---

## Scenario 1 — reach someone you just found *(US1)*

**Sign in as Alan** (`alan@example.com`), because he is the only seeded account with no
conversations. `pnpm start --reset` puts him back if you have already used him.

1. Open **Discover**. Ada and Grace are listed; Alan is not, because he cannot see himself.
2. Select **Ada Lovelace**, then **Message Ada Lovelace**. A thread opens at
   `/messages/new/<attendeeId>` with the conversation-starter prompt.
3. **Before typing, check the database.** There must be no row for this pair — FR-503a says opening
   a thread creates nothing:

   ```sql
   select count(*) from conversation_pairs;   -- 1, the seeded Ada-Grace pair, and only that
   ```

4. Confirm **send is disabled**. Type a single space; still disabled (FR-512). Nothing you can do
   here produces a post-submit error, which is the requirement.
5. Type a line and send. The message appears; the composer clears; the address becomes
   `/messages/<conversationId>`.
6. Now the rows exist — one conversation, one pair, **two** participants, one message:

   ```sql
   select count(*) from conversations;             -- 2
   select count(*) from conversation_pairs;        -- 2
   select count(*) from conversation_participants; -- 4
   ```

7. Navigate to Discover, open Ada again, choose **Message Ada Lovelace** a second time. **The same
   thread opens with its history** — no second conversation (FR-510). `conversation_pairs` is still
   at 2.

**Also prove the refusal, and it needs one throwaway account.** Sign up a new account in a fresh
profile and join **`FH-2026`** (Frontend Horizons) *only*. It now shares a conference with Ada and
**none** with Grace. From that account's DevTools console:

```js
// Locally the API is its own origin on :3000. The single-origin `/api/...` arrangement is what
// Caddy provides in a deployment, not what `pnpm start` runs. `credentials: 'include'` is what
// sends the session cookie — without it every call below is anonymous and answers 401.
const post = (attendeeId) =>
  fetch('http://localhost:3000/conversations', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ attendeeId, body: 'hello' }),
  }).then((r) => r.status)

await post('<Grace\'s attendee id>') // real person, no shared conference
await post('00000000-0000-4000-8000-000000000000') // nobody at all
```

Both must be **404**. If they differ, the route is an existence oracle (FR-504). Get Grace's
identifier from `select id, display_name from attendees;`.

---

## Scenario 2 — hold a conversation *(US2)*

Back to **Ada and Grace**, who already have a thread.

1. As Grace, open **Messages**. Ada's conversation is listed with her name, avatar and the last
   message as a preview.
2. Reply. As Ada, with the thread already open, confirm the reply appears **within five seconds
   without reloading** (SC-502). This is the polling path of research R4.
3. Switch to a different browser tab for a minute, then come back. The thread catches up immediately
   on becoming visible. Polling stops while hidden by design (`VisibilityService`) — open the
   Network panel filtered to `messages` and watch the requests stop and restart.
4. **Switch the active conference** from the event switcher — Ada has Frontend Horizons, Grace has
   Systems & Scale. Open Messages again: the list and every thread are **unchanged** (FR-507,
   SC-511). This is the single clearest check that conversations are not event-scoped, and it is
   why both accounts were given a second conference.
5. Narrow the window below `tablet`. The list and thread become **separate full-width views with a
   back affordance**, never two panes. Confirm no horizontal scrolling is needed anywhere
   (FR-580) — the prototype's avatar strip must not have survived.

**The authorization check that matters most.** Sign in as **Alan** in a third profile and, from his
DevTools console:

```js
const get = (path) =>
  fetch(`http://localhost:3000${path}`, { credentials: 'include' }).then((r) => r.status)

await get('/conversations/<Ada and Grace\'s conversation id>/messages')
await get('/conversations/00000000-0000-4000-8000-000000000000/messages')
```

Both must be **404**, never 403 (FR-524). A 403 would confirm to Alan that those two specific people
are talking, which is exactly the disclosure the identical answer prevents. Repeat with
`POST .../messages` and with `POST /conversations/<id>/read` — every route on a conversation answers
the same way.

---

## Scenario 3 — stop unwanted contact *(US3)*

Block and report live in the **thread header**, not on the profile — they are about a conversation
you are in.

1. As Grace, open Ada's thread and choose **Block Ada Lovelace**. Confirm the dialog appears,
   dismisses on **Escape**, and returns focus to the control that opened it (FR-583).
2. Confirm the block. `select blocker_id, blocked_id from attendee_blocks;` shows **one** row —
   blocks are directional, so Grace blocking Ada is not Ada blocking Grace.
3. As Ada, send into the thread. Expect refusal — and confirm the message Ada sees says only that it
   could not be sent. **If Ada can tell a block exists, FR-537 is broken.** The response is a
   **409 with no reason**; check the Network panel.
4. As Ada, run scenario 1's `post()` snippet naming Grace. Refused likewise, and with the same
   reasonless 409 (FR-536).
5. As Grace, confirm the history is intact and the composer shows the unavailable state with an
   unblock action (FR-538, FR-539).
6. Unblock. Ada can send again; nothing was lost.
7. As Grace, choose **Report Ada Lovelace**. Confirm **submit is disabled while the reason is
   empty** (FR-546), then submit. Verify all three effects:
   - Ada is blocked — the same query again, whether or not Grace had already blocked her;
   - a row exists in `abuse_reports`, carrying the reason;
   - **the API's terminal shows what left the product.**
8. **Read that terminal line carefully — it is the requirement.** With no `MAIL_OPERATOR_ADDRESS`
   configured (the default, register entry 21), you get:

   ```
   abuse report written but not dispatched: no operator address is configured
   ```

   **The block still took effect and the row was still written.** That is FR-549: a safety
   mechanism that depends on an external service is not one. Set `MAIL_OPERATOR_ADDRESS` in `.env`,
   restart, and report again to see the other half — a boxed `development mail sink` banner naming
   the report identifier, the timestamp and **the number of messages cited**. Confirm it carries
   **no message text and no reason string** (research R11).

**The negative check, which is a requirement**: look for any route, screen or navigation entry that
displays a report. There must be none (FR-548, SC-508) — not for an operator, not for the reporter,
not for anyone. `apps/api/tests/unit/no-report-read-surface.test.ts` asserts the same thing four
ways, and finding nothing here is the pass condition.

---

## Scenario 4 — know something is waiting *(US4)*

1. As Ada, send to Grace. As Grace, open **Home**: the card reading **"You have unread messages"**
   is present.
2. Open the conversation, return to Home: the card is **gone entirely** — not a zero, not an empty
   state (FR-528, FR-531).
3. **The case the prototype got wrong**: as Grace, reply in the thread; have Ada send two more; then
   have Grace open a *different* conversation. Grace's original thread must **still read unread** —
   unread follows the read position, not who spoke last (FR-527).
4. **Isolate the card's failure** without stopping anything: DevTools → Network, find the `unread`
   request, right-click it → **Block request URL**. Reload Home. The unread card
   shows **its own failure state with a retry**, and **every other Home card renders normally**
   (FR-533, SC-517). This is decision 9 — Home is composed, not aggregated — and one blocked URL is
   the cheapest way to see it.
5. As Ada, look everywhere for any sign that Grace read the message. There must be none — no tick,
   no timestamp, no "seen", nothing in the API response either (FR-530, SC-512). Look at the
   `conversations` response in the Network panel: the other person's read position is not in it,
   because it is never sent.

---

## Scenario 5 — be reached when the app is closed *(US5)*

> **This scenario now delivers real notifications.** Everything from the browser's subscription to
> the notification on your desktop runs for real: `WebPushService` signs the payload with your VAPID
> pair and POSTs it to whichever push service the browser chose — `fcm.googleapis.com` for Chromium,
> Mozilla's for Firefox. There is no vendor to sign up with; the endpoint arrives inside the
> subscription the device hands over.
>
> With **no** VAPID keys the API falls back to `SinkPushService`, which records instead of sending.
> That is the correct behaviour for an unconfigured deployment and it is why this scenario needs the
> keys from *Turning notifications on locally* above — without them, step 1 shows nothing at all,
> correctly.

**Desktop is the easier place to test this, not a phone.** Chrome, Edge and Firefox on the desktop
all support Web Push and raise real OS notifications, and `localhost` is a secure context so no
HTTPS or tunnel is needed. Two caveats:

- **Safari on macOS** only delivers Web Push to sites added to the Dock as a web app (16.4+).
- **Not a private or incognito window** — see the prerequisites. It is the single most common reason
  this scenario appears broken.

### The server half — dispatch

1. As Grace, open **Messages** for the first time. Confirm you are **told what notifications are for
   before any browser permission prompt appears** (FR-551): a card reading *"Get told when someone
   writes to you"*. A cold browser prompt on load is a failure. Nothing has been asked yet — check
   DevTools → Application → Notifications, still `default`.
2. Choose **Turn on notifications**. *Now* the browser prompts. Grant it. The card is replaced by a
   one-line confirmation, and:

   ```sql
   select attendee_id, left(endpoint, 60), last_delivered_at from push_subscriptions;
   ```

   One row for Grace, with a real push-service URL.

   **This query is the check that matters, and it is worth running for both accounts** before
   going further. Granting permission is not the same as holding a subscription: if the row is
   absent the attendee cannot receive anything, whatever the browser said. A missing row almost
   always means a private/incognito window — see the prerequisites.
3. Reload Messages. **The card does not come back** — there is no bell, no badge and no permanent
   notification chrome anywhere (FR-560).
4. Close Grace's tab entirely. As Ada, send her a message.
5. **A notification appears on your desktop**, titled **Ada Lovelace** — that is M7: the sender is
   identified by *name*, not an identifier, because a notification is read by a person. Activating
   it opens the conversation (FR-554); with the window already open it focuses and navigates rather
   than opening a second copy.

   The API's terminal confirms the server's half with one line carrying counts only:

   ```
   INFO: push fan-out complete   delivered: 1  failed: 0  gone: 0
   ```

   **If nothing arrives, that line says which half failed.** `delivered` with no notification is
   browser- or OS-side. `failed` with a `403` is a VAPID key mismatch, and the log names it as such.
   `gone` means the endpoint is dead and the subscription has been discarded (FR-557).

   Without VAPID keys the same step logs `push RECORDED by the development sink` instead, carrying
   the endpoint, title and body — the sink's record standing in for a delivery.

   Send a message longer than 500 characters and confirm the delivered `body` is
   truncated — the payload budget is bytes of body text, and the cap exists because a Web Push
   payload is limited to roughly 4 KB *once encrypted*.

   **`warn`, not `info`**, because the API's development log level is `warn` — and because the
   honest severity of a recorded delivery is that a notification did not arrive.
6. `select last_delivered_at from push_subscriptions;` is now set — that column is how a stale
   registration is recognised later.
7. **Block, then send.** As Grace block Ada, then have Ada attempt to send. The send itself is
   refused with a reasonless 409, so **no line appears** in the terminal (FR-542, FR-558). Unblock
   afterwards.

   What this cannot show by hand is *why the check is made twice*: the send path checks, and
   `notifyRecipient` checks **again** at dispatch. The second one is for the window between a
   message being accepted and its notification going out — a block landing in that gap must still
   suppress the notification. `push-blocked-sender.test.ts` closes that window deliberately; here
   you are confirming the ordinary case.

### The client half — receiving and opening

Step 5 already exercised these handlers for real. What DevTools adds is the **edge cases a real
send cannot produce on demand** — a malformed payload, and two notifications racing for the same
conversation. It is also how to test the client half with no VAPID keys configured at all.

8. In Grace's browser: **DevTools → Application → Service Workers**, find the worker, put this in
   the **Push** box and press **Push**. (Chrome and Edge have this box; Firefox does not, so use a
   Chromium browser for steps 8–11. In `pnpm start` the worker is listed as `dev-sw.js`; in a
   `preview` build it is `sw.js` — both are the same `src/sw.ts`.)

   ```json
   { "title": "Ada Lovelace", "body": "See you at the keynote.", "conversationId": "<a real conversation id>" }
   ```

   A system notification appears with Ada's name as the title (FR-553).
9. **Activate it.** The application opens **on that conversation** (FR-554). Do it twice: once with
   the tab closed — a window opens — and once with the tab open on Home. The second must **focus and
   navigate the existing window**, not open a second copy.
10. Press **Push** with the box **empty**. A notification still appears, reading *"New message /
    You have a new message."* — `userVisibleOnly` was promised at subscribe time, so showing nothing
    would let the browser substitute its own *"this site was updated in the background"* message.
11. Push twice with the same `conversationId`. The second **replaces** the first rather than
    stacking — one notification per conversation.

### The half that matters most — denial

12. **In a third browser profile, deny the permission, and run scenarios 1, 2 and 4 end to end.**
    Everything must behave identically except that no notification arrives (FR-552, SC-504).
    Confirm the explanation card **does not reappear** on later visits: a denial is an answer, and
    re-asking is the failure. `push-denied-fallback.test.tsx` asserts the same thing.

### What cannot be walked by hand

- **Two devices for one attendee** (FR-555, FR-556) needs two browsers subscribed to the same
  account; doable, but revoking cleanly is fiddly. `push-subscription-lifecycle.test.ts` covers
  re-registration replacing rather than accumulating, and one device's revocation leaving others
  untouched.
- **A permanently dead subscription being discarded** (FR-557) needs the push service to answer
  `410 Gone`, which only a real provider does. The sink's `markGone` seam is not reachable from
  outside the process; `push-gone.test.ts` covers it.

---

## Scenario 6 — a conversation outlives the other person *(US6)*

**Use a throwaway account, not Ada or Grace** — deletion is real and irreversible, and you will want
the seeded pair for everything else. Sign up account **D** in a fresh profile, join `PDS-2026`, and
exchange messages with Ada in both directions. `pnpm start --reset` is the way back if you delete the
wrong one.

1. Delete **D's** account: **Profile → Account → Delete my account → Delete everything**.
2. As Ada, open the conversation:
   - Ada's own messages are **all still there** (FR-572).
   - **None of D's remain**, in this or any other conversation (FR-570, SC-509):
     `select count(*) from messages where author_id = '<D>';` — zero, and the row is gone rather
     than blanked. (`author_id`, not `sender_id` — the column is named for who wrote the message,
     not for the act of sending it.)
   - **No name, no avatar, no identifier of D is rendered anywhere** (FR-573, SC-510). Check the API
     response, not just the screen: in the `messages` request in the Network panel, `counterpart`
     must be **`null`**, not an object with emptied fields.
   - The composer is unavailable **with an explanation**, and a direct `POST` to the messages route
     is refused with **403 and a reason** (FR-574) — different from the 404 a non-participant gets,
     deliberately: this is a fact about a thread Ada can already read in full.
3. Check the database — D's `conversation_participants` row is gone, the `conversation_pairs` row is
   gone, and `conversations` retains no identifier of D at all:

   Scope each one to that conversation — Ada still has her seeded thread with Grace, so an
   unqualified `select *` shows both and proves nothing:

   ```sql
   \set c '<the conversation id>'
   select * from conversations              where id = :'c'::uuid;  -- survives, naming nobody
   select * from conversation_participants  where conversation_id = :'c'::uuid;  -- only Ada
   select * from conversation_pairs         where conversation_id = :'c'::uuid;  -- no rows
   ```

4. **The edge case worth doing by hand**: repeat with a conversation where D wrote *every* message —
   D opens it, Ada never replies, then D deletes. Ada must see the **closed-thread explanation, not
   the conversation-starter prompt** (FR-519a). Inviting Ada to start a conversation she cannot send
   into is the exact failure this check exists for, and it is one line of state apart from the
   correct behaviour.
5. Delete Ada as well — on a `--reset`-able database, since this is the seeded account. The
   conversation is **removed entirely** (FR-575): a conversation nobody is left in is deleted, which
   no cascade could do, because `conversations` deliberately holds no attendee foreign key.

---

## Full verification

```bash
pnpm verify          # all ten gates, in the order CI runs them
```

Individually, when iterating:

```bash
pnpm test:unit         # deletion-coverage, export-coverage, participation-audit, notification-triggers
pnpm test:component    # every declared state, and the denied-permission fallback
pnpm test:integration  # non-participant refusal, push dispatch, block-at-dispatch — a real database
pnpm test:e2e          # the journeys, two sessions at a time
pnpm test:a11y         # keyboard, focus, labels
pnpm contract:check    # committed openapi.json matches the registered routes
pnpm budget            # asset budget — Messages must be code-split (research R7)
```

Just this feature's push suites:

```bash
pnpm vitest run --project integration apps/api/tests/integration/push-*.test.ts
pnpm vitest run --project component apps/web/tests/component/push-*.test.tsx
pnpm vitest run --project unit apps/api/tests/unit/notification-triggers.test.ts \
                               apps/web/tests/unit/no-notification-surface.test.ts
```

**Two caveats about running the gates locally**, both pre-existing and both recorded in `tasks.md`:

- **`pnpm budget` cannot judge a plain local build.** `envDir: '../..'` makes Vite load the root
  `.env`, which sets `NODE_ENV=development`, so `pnpm build` emits **development** React — roughly
  60 KB heavier than what CI measures. The script detects this and declines to judge rather than
  reporting a red result about a bundle nobody receives. For a real figure:
  `NODE_ENV=production pnpm build && pnpm budget`.
- **`pnpm test:integration` needs the `mynet-pg` container**, which `pnpm start` leaves running.

**If you regenerate migrations**: move `apps/api/migrations/meta/README.md` aside first, because
`drizzle-kit generate` JSON-parses every file in `meta/`. Put it back afterwards.

---

## What cannot be validated here, and why

| | Blocked on | What covers it instead |
|---|---|---|
| ~~A real notification reaching a real device~~ | **Nothing — this now works.** `WebPushService` signs with your VAPID pair and POSTs to the browser's own push service. Register entry 20 turned out to name a decision that does not exist: Web Push has no vendor to choose | Walk scenario 5 |
| A discarded dead subscription (FR-557) | Reaching it deliberately — a real endpoint has to actually die, which you cannot arrange on demand | `push-gone.test.ts`. In the wild it happens when a browser replaces a subscription, and the log line names it |
| Key custody across environments | **Register entry 20's real question**: who holds the private key per environment, and what happens on rotation — which silently stops delivery for everybody until each browser re-registers | Nothing yet. It is an owner decision, not a vendor comparison |
| Operator report mail actually arriving | **The mail provider** (entry 18) and **the operator address** (entry 21) | The sink prints what would have been sent; with no address the skip is logged, and the block and the record still happen (FR-549) |
| Anything on a deployed environment | **No domain and no Azure subscription** are decided, so `deploy-uat` and `deploy-prod` print what they are blocked on and exit 0 | `deploy/vm/README.md` is the runbook; `OPERATIONS-LOG.md` records the restore that *has* been exercised locally |

None of these is a gap in the code, and none is discovered by walking this document — they are
recorded here so that finding them is not mistaken for finding a defect.
