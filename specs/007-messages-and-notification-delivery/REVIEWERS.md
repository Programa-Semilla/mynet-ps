# Review Guide: Messages, and the Notification Delivery Platform It Needs

**Generated**: 2026-08-07 | **Spec**: [spec.md](spec.md)

## Why This Change

MyNet's core journey is *inspect the next session → discover a relevant attendee → **message them** →
schedule a meeting*, and the middle step has a hole in it. Discover shipped in 006 with its *message*
action deliberately left out rather than shipped inert, so an attendee who finds someone worth
meeting currently has no way to reach them. Messages is the fourth of the five destinations and the
last one on the critical path before the journey closes.

There is a second problem the first one creates. A networking product's whole value is a timely
reply, and a message discovered an hour after a session ended is worth very little — which is why
this feature also brings notification delivery in, reversing an exclusion that has stood since 001.

## What Changes

Attendees get private 1:1 conversations that are **permanent and independent of which conference is
active** — a contact made at one event does not vanish at the next. Any attendee sharing a current
event can open a conversation with any other, with no request or acceptance step; once open, it stays
open forever. Home gains its unread indicator, completing six of the seven elements
`requirements.md` names for the dashboard.

Two things go beyond the roadmap's scope for this phase, both by owner decision:

- **Web Push**, so a message reaches a device with the application closed. This is
  engagement notification delivery, which the constitution currently places out of scope.
- **Block and report**, because open send plus permanent reachability creates a contact path the
  recipient cannot otherwise close, in a product with public self sign-up and no moderator.

**No breaking change to any shipped surface.** Nothing existing is altered: seven new tables, no
column touched, and the two shared registries (Home cards, navigation) are appended to rather than
edited.

## How It Works

**Participation replaces event scope as the authorization predicate.** Every prior feature read data
reachable by exactly one identity, guarded by a branded `EventScope` that only `requireEventAccess`
can construct. A message has two owners who are not interchangeable, and conversations are not
per-event — so that guard does not apply. 007 adds a branded `ConversationScope` and a
`requireParticipation` guard in the same shape, plus its own route audit.

**Seven tables on migration `0006`**, all cross-event, all reached by a real foreign-key cascade —
no allow-list entry is needed for any of them. `messages.author_id` cascading is the whole of the
deletion decision: a departing attendee's messages leave every conversation, while the other
participant keeps their own in a surviving one-sided, read-only thread.

**Two freshness paths, deliberately independent.** Web Push covers the closed application; a
3-second poll, running only while a thread is open and the tab is visible, covers the open one.
Permission is deniable, so the second path is not optional — an attendee who declines gets a fully
working product.

**Two existing ports are extended, and both were built to resist it.** `NotificationService` carries
a comment saying the implementation must not be wired to real delivery; `MailService` has exactly two
methods so that adding a third requires editing the file. Both guards worked as designed. The
extensions are argued in place rather than performed quietly.

**The client's service worker changes strategy** from `generateSW` to `injectManifest`, because a
push handler is code and the generated worker is not ours to edit.

## When It Applies

**Applies when**:

- Two attendees share at least one current event — the only moment co-attendance is ever checked.
- A conversation already exists, regardless of which event either attendee is now at, or whether they
  share one at all.
- An attendee has granted notification permission on at least one device (for push only).

**Does not apply when**:

- The attendee is offline. Messages requires connectivity, and the refusal to cache is declared
  rather than omitted — a stale conversation is misleading in a way a stale programme is not, and
  message content is the most sensitive data in the product.
- More than two people are involved. Group conversations are out of scope.
- The content is anything but plain text. No attachments, no formatting, no message search.
- The notification concerns anything but a received message. Appointments (008) and Q&A (009) may
  adopt the platform later; 007 does not deliver notifications for them.
- Network contacts are being derived. **008 must not derive contacts from the existence of a
  conversation** — under open send that would let a stranger insert themselves into someone's
  Network.

## Key Decisions

1. **Open send, not request-then-accept.** A conversation is created by its first message, with no
   consent step. Request-then-accept was considered and rejected because *that is the connection
   model* — a decision the register reserves for the client and which blocks 008. Choosing it here
   would have resolved a client question by inference. The cost is accepted and mitigated by
   decision 4.

2. **Threads are permanent and event-independent.** Read-only-without-co-attendance was considered
   and rejected as contradicting the standing decision that relationships persist — a contact you
   cannot write to is weaker than that decision promises.

3. **A departing attendee's messages vanish; the survivor keeps their own.** Deleting the whole
   conversation was rejected because it destroys data belonging to someone who never asked. Severing
   authorship and keeping the text was rejected because message text is free-form and routinely
   self-identifying, so it does not de-identify anything — it would fail a Principle VIII review.

4. **Block and report ship with the feature, not after it.** 007 creates the exposure, so 007
   answers it. Reporting **auto-blocks** so protection lands before anyone reads anything.

5. **Reports resolve to an operator, not an organizer.** The constitution forecloses organizer
   administration *inside the product* — no admin interface, no privileged role. It does not forbid
   the project's operator, who already runs two hosts, backups and secrets. A report leaves by mail
   and is acted on out-of-band. **No screen, role or route in this product may read one.**

6. **Push payloads carry message content.** Signal-only was recommended and rejected by the owner.
   The accepted cost is recorded rather than hidden: the most sensitive content in the product
   appears on lock screens.

7. **Nothing is cached.** Caching with a retrieved-at stamp was recommended and rejected. The
   consequence is that Messages is unavailable on bad venue wifi, which is where a conference
   attendee is.

8. **`conversation_pairs` is a table, not a column.** The obvious `pair_key` on `conversations` would
   retain a deleted attendee's identifier, breaching the no-tombstone rule. A pair table with real
   foreign keys cascades away instead.

9. **Message length is capped at 2,000 characters** — a Web Push payload constraint (~4 KB
   encrypted) rather than a matter of taste, once payloads carry content.

## Areas Needing Attention

**Start here, in this order.**

1. **This feature is knowingly ahead of the constitution, and must not merge until it isn't.**
   Open Questions Register entry 10 places engagement notification delivery out of product scope
   until a recorded decision brings it in. Owner decision M4 is that decision; **the amendment has
   not been ratified**. The spec declares this in three places. Entry 10's surviving half — the
   notification bell must not be reproduced — is carried forward intact. *Check that the amendment
   landed before approving.*

2. **The existing route audit cannot see this feature, and looks like it can.**
   `event-scope-audit.test.ts` matches routes by conference identifier. Conversation routes name no
   conference — correctly — so the audit **passes them without inspecting anything**. The new
   participation audit is what closes that, and 008's appointments will inherit the same gap. If you
   review one mechanism closely, make it this one.

3. **The service-worker strategy change is the highest-risk mechanical step.** Moving to
   `injectManifest` means hand-carrying `navigateFallback`, the API cache exclusion and precache
   eviction into a source worker. **Silently dropping the API exclusion would answer API requests
   with the HTML shell** — a failure that would look like data corruption rather than a caching bug.

4. **Open send has no consent step, by design.** Reasonable engineers will disagree with this. The
   alternative was put to the owner and declined; block and report are the mitigation. Worth
   confirming you find that trade acceptable rather than assuming it was overlooked.

5. **Messaging is deliberately not gated on discoverability**, while reading a profile requires
   discoverable *and* verified *and* co-attending. So someone who has turned discoverability off can
   still be messaged by anyone holding a route to them. Declared in FR-504b with its reasoning, but
   it is a genuine asymmetry with 006 and you should decide whether you agree.

6. **The export excludes received messages.** Defensible — a received message is primarily its
   author's data — but standing decision 12 requires an export "covering every field collected", and
   comparable products export received correspondence. The reasoning is on the page; check you find
   it sufficient.

7. **A report can be lost.** Mail dispatch may fail, and if it fails *and* the reported attendee then
   deletes their account, the report cascades away with nothing retained. The erasure right was
   chosen over the evidence. Dispatch failure is logged and visible.

8. **Scope.** 155 tasks across two subsystems — larger than 004's 131 and 006's 110. The natural
   split is after Phase 6: Messages complete and safe, then push as its own change gated on the
   amendment. Run `speckit-spex-collab-phase-split` if you want that decided properly.

   **How it actually went**: implementation followed exactly that boundary. Phases 1–6, 8 and 9 were
   built and green first; Phase 7 stopped at the gate and waited for v3.1.0 rather than proceeding
   on the assumption the amendment would pass. The commit history reflects that order, so a reviewer
   who wants push as a separate change can still read it as one.

## Open Questions

Three blocked implementation and were **owner decisions**. The first has since been settled; the
other two remain open and neither blocks review, merge, or implementation:

1. ~~**The constitution amendment** bringing engagement notification delivery in.~~ **Settled:**
   **constitution v3.1.0** resolves register entry 10 in part — delivery in for a received message,
   the bell and an in-app notification centre still out — and ratifies `VisibilityService` and the
   operator report path alongside it. Phase 7 was implemented after that landed, not before.
2. **The Web Push provider and VAPID key custody** — register entry 20. Gates the real adapter only;
   the sink adapter makes every other push task buildable and testable, and **the shipped code runs
   on the sink**. `deploy/vm/.env.example` documents what a blank value costs.
3. **The operator address** abuse reports are mailed to — register entry 21. Gates configuration
   only: a report is still stored and still blocks the reported attendee with no address set.

Deferred to implementation against the built screen: the exact copy for a departed-counterpart
thread. Deferred to 008: whether the offline cache key gains an event-less variant, which FR-563
makes moot here but 008's cross-event contacts will meet again.

## Review Checklist

- [ ] Key decisions are justified
- [ ] Breaking changes are documented with migration guidance
- [ ] Scope matches the stated boundaries
- [ ] Success criteria are achievable
- [ ] No unstated assumptions
- [X] **The constitution amendment reversing register entry 10 has landed** — v3.1.0
- [ ] A received message is still the only thing that dispatches a notification (FR-561)
- [ ] Participation guard and its audit cover every conversation and message route
- [ ] All seven new tables are classified in `deletion-coverage`, with no allow-list entry
- [ ] No route, role or screen anywhere reads a report
- [ ] The notification bell is still absent
- [ ] `mynet/no-direct-platform-access` still reports zero violations

---

<!-- Code phase sections are appended below this line by the phase-manager command -->
