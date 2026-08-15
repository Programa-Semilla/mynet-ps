# Deep Review Findings

**Date:** 2026-08-08
**Branch:** `feat/007-messages-and-notification-delivery`
**Rounds:** 3 of 3
**Gate Outcome:** PASS — 0 Critical, 0 Important remain
**Invocation:** manual (`/speckit-spex-deep-review-run`)

## Summary

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 1 | 0 (reclassified — out of diff) | 0 |
| Important | 20 | 20 | 0 |
| Minor | 17 | 3 | 14 |
| Notable | 3 | — | 3 |
| **Total** | **41** | **23** | **17** |

**Agents completed:** 5/5. **External tools:** CodeRabbit and Copilot skipped (CLI not installed).
**Raw findings:** 51, merged to 41 after deduplication.

| Agent | Found | Fixed | Remaining | Status |
|---|---|---|---|---|
| Correctness | 11 | 5 | 6 | completed |
| Architecture & Idioms | 11 | 4 | 7 | completed |
| Security | 6 | 2 | 4 | completed |
| Production Readiness | 9 | 5 | 4 | completed |
| Test Quality | 14 | 10 | 4 | completed |
| CodeRabbit (external) | — | — | — | skipped (CLI not installed) |
| Copilot (external) | — | — | — | skipped (CLI not installed) |
| Test suite (regression) | 6 | 6 | 0 | passed after round 1 |

**MVP: Test Quality (14 findings).** It was the only agent that attacked the *guards* rather than
the code, and it found two that were hollow. That is the class of defect this feature is most
exposed to, because so much of its safety is delegated to fail-by-existence tests.

---

## The three findings worth reading first

### FINDING-1 — `substitution.test.ts` was a governance gate that never fired

**Severity:** Important · **Confidence:** 90 · **Source:** test-quality · **Round:** 1 ·
**Resolution:** fixed (round 1) · `packages/platform/tests/substitution.test.ts:272-298`

**What was wrong.** The test asserted `devices.notifications.isSupported() === false` under a
comment reading *"If somebody wires real delivery, this test fails, and that failure is the
conversation."* Constitution v3.1.0 brought delivery into scope, 007 wired `WebNotificationService`
to a real `PushManager` — **and the test kept passing.** `webDevices()` is called with no VAPID
key, and jsdom has neither `Notification` nor `PushManager`, so `isSupported()` returned false for
four environmental reasons that say nothing about whether the capability is wired.

**Why it matters.** The governance event the gate existed to catch had already happened without it
firing, and its comment went on asserting a product scope the constitution had reversed. Any change
to `WebNotificationService` — including deleting `subscribe()` outright — left it green.

**How it was resolved.** Split. Calendar keeps the genuine unwired assertion. Notifications now
assert the **contract** against a service constructed *with* a key: `subscribe()` resolves to
`null` where there is no service worker, `unsubscribe()` resolves, and an absent key still reports
unsupported. None of those depend on what jsdom happens to lack.

---

### FINDING-2 — the bell guard's regex was written backwards

**Severity:** Important · **Confidence:** 90 · **Source:** test-quality · **Round:** 1 ·
**Resolution:** fixed (round 1) · `apps/web/tests/unit/no-notification-surface.test.ts:61-82`

**What was wrong.** The pattern's third alternative was
`/from 'lucide-react'[\s\S]{0,200}\bBell\b/` — requiring `Bell` **after** the module string. A
named import puts the identifier before it, which is how every lucide import in this codebase is
written. Verified directly: `import { Bell } from 'lucide-react'` matched **none** of the three
alternatives.

**Why it matters.** FR-560 is the half of register entry 10 that v3.1.0 explicitly did *not*
reverse. The guard's own header says the bell "will be added in good faith by somebody who assumes
its absence was an oversight" — and the most likely spelling of that addition was the one the regex
missed. It caught `BellIcon` and `BellRing`, the two *less* common imports.

**How it was resolved.** Rewritten import-shape-first, with a JSX alternative, plus a test that
asserts the pattern against synthetic samples — including `import { Ban, Flag }`, 007's own icons,
which must **not** match. A regex whose direction can silently invert is not a control.

---

### FINDING-3 — `POST /blocks` accepted any UUID, and `GET /blocks` served live personal data

**Severity:** Important · **Confidence:** 78 · **Source:** security · **Round:** 1 ·
**Resolution:** fixed (round 1) · `apps/api/src/routes/blocks.ts`, `db/queries/blocks.ts`

**What was wrong.** `blockAttendee` required only that the target *exist* — no co-attendance, no
conversation, no discoverability. `GET /blocks` then joins `attendees` **live** and returns the
target's current `display_name` and card avatar bytes.

**Why it matters.** Harvest UUIDs from Discover during a conference, block them, and keep reading
those people's names and faces indefinitely — after they turn discoverability off, after they leave
the event, after you do. That is a server-side surface with precisely the property 006 refuses to
cache the directory for: *other people's personal data outliving the moment they chose to be
invisible* (FR-363). Separately, the 404-vs-204 split was a plain attendee-existence oracle, in the
same product where `POST /conversations` goes to considerable length not to be one.

**How it was resolved.** Blocking now requires reachability — sharing a current conference **or**
already having a conversation (conversations outlive events, so the second half is load-bearing).
Everything else takes the same **204** a real block takes, so the status cannot be read as an
existence check. `POST /reports` inherits both through the same call.

---

## Findings fixed in round 1

| # | Severity | Finding | Source | File |
|---|---|---|---|---|
| 4 | Important | `recordDelivery` stamped `last_delivered_at` on endpoints that had just **failed** — `dispatchToDevices` returned a count, so the caller reconstructed "delivered" as *everything not gone*. The one operational column describing delivery health was systematically wrong for the unhealthy devices, and a non-throwing `'failed'` logged nothing at all | correctness, architecture, production (×3) | `notifications/dispatch.ts`, `routes/conversations.ts` |
| 5 | Important | `conversation_create` — the one throttle allowed to **deny** — was charged before the outcome was known. Discover's Message action always routes through `POST /conversations`, so writing to somebody you already had a thread with was billed to the creation cap and answered **429**. FR-511a forbids refusing a legitimate send | correctness | `routes/conversations.ts`, `db/queries/conversations.ts` |
| 6 | Important | The 3-second poll re-read page one and **replaced** the whole list, discarding any history loaded through "Show earlier messages" within one tick and rewinding the cursor | correctness, production (×2) | `messages/useConversation.ts` |
| 7 | Important | The scroll effect had **no dependency array**, so it ran after every render — yanking the viewport to the bottom every 3 seconds, and when the block or report dialog opened | correctness, production (×2) | `messages/Thread.tsx` |
| 8 | Important | The live region announced **once, ever**: the same string literal was written each time (React bails on equal state, so the DOM never mutated), and the guard's `!== null` precondition meant a thread that opened empty never announced its first arrival at all (FR-585) | correctness, architecture (×2) | `messages/useConversation.ts`, `Thread.tsx` |
| 9 | Important | `NotificationPrompt.enable` awaited `requestPermission` and `storage.set` **outside** its `try`. Either can reject; the component then sat in `working` forever with both buttons disabled and no way out | correctness, architecture (×2) | `messages/NotificationPrompt.tsx` |
| 10 | Important | `participation-audit` — the feature's only structural authorization gate, which 008 inherits — matched on the parameter **name** `:conversationId`. A route named `/conversations/:id/messages` was never examined, and an unguarded route passed while the audit reported success | security, test-quality (×2) | `tests/unit/participation-audit.test.ts` |
| 11 | Important | `SinkPushService` recorded every delivery into an **unbounded** array. It is the only `PushService` that exists and runs in every deployed environment, so a long-lived container retained message bodies in memory for the life of the process | production | `notifications/sink-adapter.ts` |
| 12 | Important | `PUSH_DISPATCH_TIMEOUT_MS` defaulted to **10 seconds** and is awaited inside the send, so a hanging push service left the sender's composer disabled and their own message unrendered for ten seconds | production | `config.ts` |
| 13 | Minor | `no-message-mutation-routes` had the same name-keyed hole: `/messages/:id/retract` evaded it | test-quality | `tests/unit/no-message-mutation-routes.test.ts` |
| 14 | Minor | `blocks.ts` documented an existence check "folded into the insert… the statement simply affects no rows". The code does the insert **and then a separate read**, non-transactionally | architecture | `db/queries/blocks.ts` |
| 15 | Minor | `MESSAGE_MAX_LENGTH` is declared twice and nothing checked they agreed — the third hand-copied bound, in the file that exists for exactly that class of defect | test-quality | `tests/unit/client-limits.test.ts` |

---

## Findings fixed in round 2

| # | Severity | Finding | Source |
|---|---|---|---|
| 16 | Important | **`src/sw.ts` had no test at any layer** — not unit, not component, not e2e. It carries the whole of FR-554, the malformed-payload fallback, the replacement tag, and the navigation denylist its own header calls "the highest-risk mechanical step in the feature". Every line could be deleted and the ten gates stayed green | test-quality |
| 17 | Important | `push-latency`'s "ten devices cost roughly what one does" ran against a sink whose `send` resolves **synchronously**. A sequential fan-out passed it. The test could not distinguish `Promise.all` from a loop — the one distinction it exists to make | test-quality |

For 16, the new guard is source-level rather than behavioural, and the reason is written into it:
importing the worker would drag `lib="webworker"` globals back into the jsdom program, reintroducing
the exact problem `tsconfig.sw.json` exists to solve. **It was verified to fail** by removing the
denylist. For 17, the new test drives a port that costs real time, derived from the configured
dispatch timeout — and **was verified to fail** against a sequential fan-out (176ms against an 80ms
bound).

---

## Test Suite Results

| Round | Command | Failures | Status |
|---|---|---|---|
| 1 | `pnpm verify` | 6 integration, then 1 component | resolved within the round |
| 2 | `pnpm verify` | 0 | exit 0 — 344 unit, 448 component, 763 integration, 129 e2e |
| 3 | `pnpm verify` | 0 | exit 0 — see the run recorded with this document |

The six round-1 failures split three ways, and the split is the interesting part:

- **Three were tests pinning the oracle that finding 3 removed** — they asserted 404 for a
  nonexistent attendee, which *was* the disclosure. Updated, with the reasoning written into them.
- **One was a fixture that only worked because of the permissiveness removed** — accounts that
  signed up and never joined a conference. They now join, which is more faithful to the product.
- **One was a genuine regression introduced by the fix**: the new `conversationExistsBetween`
  pre-check cast to `::uuid` without the guard the surrounding code has, so a malformed identifier
  raised and answered **500** where the route's contract is that malformed, nonexistent, stranger
  and self are byte-identical 404s. `conversation-co-attendance.test.ts` caught it.

A seventh failure surfaced separately and was one problem wearing three faces: `findBy*`'s 1000ms
default is too tight for a **code-split destination**, whose wait covers a dynamic `import()` plus a
repository read. Three tests failed only under the full component project's parallel load. Fixed
once, globally, in `tests/setup.ts` — no assertion changed, and a genuinely missing element still
fails, five seconds later instead of one.

---

## Findings fixed in round 3

The seven left after round 2, all closed. Four were coverage gaps; three changed behaviour.

### Coverage

| # | Finding | What was added |
|---|---|---|
| 18 | **The visibility-gated poll had no test** — the behaviour that justified adding a *seventh device capability* to Principle V. The harness hardcoded `isVisible: () => true`, nothing used fake timers, and `substitution.test.ts` built a `visibilityListeners` fixture nothing ever drove | `thread-poll-visibility.test.tsx`: reads once on open, keeps polling while visible, **stops entirely while hidden**, refetches immediately on return, and detaches its listener on unmount. **Verified to fail** by deleting `\|\| !visible` — two tests go red |
| 19 | **The FR-585 announcement fix had no test**, so the defect round 1 corrected could return silently | Four cases: silent on first read, announces a message arriving into an *empty* thread, **announces again** on a second arrival, never announces your own. **Verified to fail** by removing the keyed region |
| 20 | **`Blocks.tsx` had no test at all** — none of its three declared states, nor the unblock path (FR-541a, FR-581) | `block-list.test.tsx`: loading, empty, populated, failure-with-working-retry, offline wording, unblock-by-identifier, and unblock failure leaving the person listed |
| 21 | **`message_send`'s delay-only guarantee was asserted only as configuration** — the identical gap its sibling test was written to close | `message-send-throttle.test.ts`: sends past the allowance and asserts **zero** 429s. FR-511a permits delay and forbids denial |

The poll test needed a harness change: `messagesDouble` served page 0 to every cursor-less read, so
a test could not express *"and then a message arrived"* — which is why the announcement had no
coverage for as long as it did. `advanceOnPoll` is opt-in, because the existing behaviour is
load-bearing for the paging tests.

### Behaviour

| # | Finding | The change |
|---|---|---|
| 22 | **The poll had no backoff and no jitter**, and after the first successful read every failure was swallowed with no state change | A self-scheduling timeout replaces the fixed interval: exponential backoff to a one-minute ceiling, ±20% jitter so a hall of clients does not re-converge, reset on success. After three consecutive failures the thread says *"This conversation has stopped updating"* — a notice above the thread, not a state that blanks it, because what is on screen is still real |
| 23 | **The counterpart's avatar was re-sent on every poll** — ~3–5.5 KB of base64 that nothing can compress, twenty times a minute, for a picture that cannot change while the thread is mounted | `GET …/messages` takes `counterpart` (default `true`, so the contract and every existing caller are unchanged). The first read asks for it; refreshes pass `false` and keep what they have. The hook only clears the header when the server actually spoke — a genuinely departed counterpart still arrives as `state: 'one_sided'` |
| 24 | **`removeEmptyConversations` was an unscoped anti-join** over the whole table, run on every account deletion while cascades held locks | Scoped to the departing attendee's conversations, collected *before* the delete — afterwards the participation rows that identify them are exactly what the cascade removed. The predicate is unchanged |

## Notable Observations

Captured for future brainstorming; not defects, not fixed, excluded from the gate.

1. **Session sliding expiry writes on every request** — see *Reclassified* above. The suggested
   shape is a refresh threshold: only write when the session is materially stale.
2. **The message-read path is unthrottled and client-paced.** Nothing bounds poll frequency
   server-side. Spec open question 6 left "what it costs on a phone at a venue" open and the
   client-side half was answered; the server-side half was not.
3. **Two of the four `push` config members exist only to police each other.** `vapidSubject` is read
   by nothing, and `vapidPublicKey` on the API is a second copy of a value the client reads from its
   own `VITE_` variable. Whoever answers register entry 20 should decide whether the API serves the
   public key rather than duplicating it.

---

## Reclassified, and deliberately not fixed

**The Critical was moved to Notable.** `requireAttendee` issues an unconditional
`UPDATE auth_sessions` on **every** authenticated request, which the poll turns into ~20 row writes
per minute per attendee with a thread open, against a loopback PostgreSQL sharing two vCPUs on a
burstable VM. The analysis is sound and worth acting on. But `apps/api/src/plugins/auth-context.ts`
is **not in this feature's diff** — it is 001/004 infrastructure that 007 made hot — and changing
session-expiry semantics is an owner decision, not something a feature's review loop should take
unilaterally. Captured in `brainstorm/idea-inbox.md` with the suggested shape.

Fourteen Minor findings also remain, listed in the agent reports: comment drift, an unused
`isoColumn` helper, a `Date.parse` cursor check that can answer 500 where the contract wants 404, a
block check ordered before reachability, `last_message_at` not recomputed after a cascade, and
several test-quality observations. None affects a requirement; each is recorded rather than rushed.

## Conclusion

**Gate: PASS after round 3** — 0 Critical, 0 Important remaining.

The review's most valuable output is not the 41 findings but a pattern across three of them: **this
feature's safety is delegated to fail-by-existence guards, and three of those guards did not
guard.** `substitution.test.ts` missed the governance event it was written to catch.
`no-notification-surface`'s bell pattern was inverted. `participation-audit` — the structural
authorization gate 008 inherits — was defeated by naming a parameter `:id`.

All three passed every run. None would have been found by checking that requirements trace to tests,
which is what the spec-compliance pass does and what it found nothing wrong with. They were found by
asking a different question: *what is the cheapest way to violate this, and would the guard notice?*

Every guard added across the three rounds was **verified to fail** before being accepted — the
service-worker denylist by deleting it, the fan-out test by making the dispatch sequential, the
visibility tests by removing `|| !visible`, the announcement test by unkeying the region. A guard
nobody has watched fail is a guard nobody should trust, which is the whole lesson of the three that
did not guard.
