# Fix — the two cache mechanisms v5.4.0 licensed, the restriction guard 015 needs, and the layout R3 refused to ratify

**Date**: 2026-08-15
**Constitution**: v5.4.0 (`.specify/memory/constitution.md`), ratified 2026-08-15
**Branch**: `fix/purge-defects-restriction-guard-admin-layout`
**Type**: fix. No new capability, no schema, no migration, no new device capability.

This carries four items. **None of them is a decision** — every one was ratified in v5.4.0 and is
implementation of binding text. They travel together because they are the whole of what that
amendment left owing to code, and splitting them would leave a reader guessing which parts of R1
and R3 were built.

## Why these four, and why now

**One of them gates the next feature.** R1 says the attendee-restriction guard *"MUST be widened to
the concept before feature 015 is specified"*, and 015 is the only other startable administrative
work. It is first in this document for that reason.

**Two of them are R1's licensed mechanisms**, which the amendment declares need no further
amendment to build. **The third is R3's carve-out** — the one item ratification deliberately did
not reach, on the ground that fiat may close a judgement but cannot make a non-compliance compliant.

---

## FIX-1 — the attendee-restriction guard matches names, not the concept

### What is wrong

`apps/api/tests/unit/no-attendee-restriction.test.ts` enforces FR-1041 — *no administrative route
suspends, removes or restricts an attendee* — with **four** assertions, and a route that ends
somebody's registration passes all four:

| Assertion | Why it misses |
|---|---|
| suspends/bans/mutes/restricts | Selects on `/suspend\|ban\b\|mute\|restrict\|disable\|block\|silence/i` over the **route URL**. `.../registrations/:id` contains none of those words. |
| deletes/deactivates an account | Pre-filters on `/attendees?/i`. `.../registrations/:id` does not match. |
| touches an attendee only through promotion and demotion | **This one is a positive enumeration and is the strong assertion in the file** — but it *also* pre-filters on `/attendee\|organizers?/i` before enumerating, so the route never reaches the comparison. |
| found routes to audit | Counts only. |

So `DELETE /admin/conferences/:eventId/registrations/:id` — the most natural name for a capability
015 might add — **passes green on all four.**

### Why it matters beyond the guard

Register entry 22 was closed as **accepted** on exactly one ground: *no third party can end a
registration today.* That ground is not asserted anywhere except by these four filters. R1 states
the consequence plainly: **if any feature gives a third party the power to end a registration,
entry 22 reopens.** A guard that cannot see such a route is a guard that would let entry 22's basis
disappear silently, in a green build.

### What to change

**Widen the positive enumeration to cover every administrative write, not the subset whose URL
happens to name a person.** Remove the `/attendee|organizers?/i` pre-filter from the fourth
assertion so it enumerates **all** non-GET administrative routes and compares that set against a
written allow-list.

This is `deletion-coverage`'s property applied to routes: **a new administrative write fails by
existing**, and adding one requires writing down what it does and why it is not an act on a person.

**The three negative assertions stay.** They are cheap, they are documentation of the specific
words nobody may use, and removing them in favour of the positive one would trade a redundant check
for a single point of failure. **They must not be widened to compensate** — a keyword list is a
list of what somebody remembered, which is the finding 016's review recorded about the lint
denylist.

### Requirements

- **FIX-101**: The positive enumeration MUST cover every registered administrative route with a
  method other than `GET`, with no pre-filter on the route URL.
- **FIX-102**: The allow-list MUST be explicit and MUST name, per entry, what the route acts on.
  Adding a route to it without a stated justification is the failure this assertion exists to
  prevent.
- **FIX-103**: The assertion message MUST state that an administrative act on a person's *access*
  — not only on their account — is what FR-1041 forbids, and MUST cite register entry 22's
  dependency on it.
- **FIX-104**: A test MUST demonstrate the guard catching a route the old shape missed. It MUST
  exercise the predicate against a table of route URLs rather than depending on the routes that
  happen to exist — a guard exercised only by today's routes stops guarding when they change (009's
  precedent for the event audit's predicate).

---

## FIX-2 — the cache lifetime bounds serving and not retention

### What is wrong

`WebLocalCache` has no eviction. `write` puts an entry; only `purge` ever removes one. The
24-hour lifetime causes a stale entry to be **treated as absent** when read, and deletes nothing.

The consequence is stated in the amendment and is a broken promise rather than a preference. A
device that stops being able to reach the account — because the account was deleted elsewhere, or
the session ended and was never re-established — keeps every conference-scoped entry it had, in
IndexedDB, **indefinitely**. The deletion screen tells the attendee in bold that no copy is kept.

**This is a retention defect, not a disclosure-through-the-UI defect, and the distinction is
load-bearing for the fix.** A device in that state renders signed-out, so no surface reads those
entries and nothing is displayed. What survives is bytes.

### What NOT to do, and why

**Do not purge when a session is refused.** It is the obvious fix and it is wrong. The refusal that
arrives on a second device is a `NotAuthenticatedError` or a `SessionExpiredError` on
`getCurrent()`, and **an idle-timeout expiry is indistinguishable from a deleted account at that
call site.** Purging on it would destroy the offline copy of an attendee who is about to sign back
in, costing FR-215 for a case it was not aimed at. It is also **not one of the two mechanisms R1
licenses**, and R1 rejects three alternatives by name precisely so the next reader does not
re-propose one.

### What to change

**Delete an entry at the moment it stops being readable.** The stale branch in `cached.ts` already
identifies exactly that moment — it currently records freshness and reports "nothing cached". It
gains a purge of that one key.

This is R1's first licensed mechanism, and it closes the retention gap **without classifying why
the session ended**, which is what makes it safe. An entry that has aged out is one no caller may
be served, so deleting it removes bytes nobody was entitled to read.

### Requirements

- **FIX-201**: An entry read past `CACHE_LIFETIME_MS` MUST be deleted, not merely reported absent.
- **FIX-202**: The caller's observable outcome MUST be unchanged — it still reports that a
  connection is needed and nothing is cached. **This fix changes what is stored, never what is
  shown.**
- **FIX-203**: Deletion MUST NOT be widened to the conference prefix. One expired entry is one
  entry; purging its neighbours would discard entries that are still fresh and still readable.
- **FIX-204**: A test MUST assert the bytes are gone, by reading the store directly rather than
  through the decorator — reading through the decorator cannot distinguish "deleted" from "present
  and stale", which is the entire subject of this fix.

---

## FIX-3 — a withdrawn conference is never erased on a device that did not withdraw

### What is wrong

The caching decorator purges a conference when a read scoped to it is refused. **On a device that
did not perform the withdrawal, that read is frequently never issued.**

`GET /workspace/active-event` answers an attendee registered for nothing with **204 — a success,
not a refusal**. Every conference-scoped read in the client is gated behind that call resolving to
`ready`, and no route carries an `:eventId` parameter, so **no destination holds a remembered event
id it could fire with.** After a cold start or a full reload, the client never addresses the
withdrawn conference again, so nothing is refused and nothing is purged.

A tab already open at `ready` does eventually purge — the next gated surface to mount or retry
issues a read that is refused. But nothing forces it: there is no poll, no focus refetch and no
reconnect refetch of the active event. **A device coming back online does not purge; it purges when
somebody happens to navigate.**

The comment in `cached.ts` asserting that *"online, an authorization refusal purges the
conference's entries immediately"* is true of the mechanism and silent on whether the refusal
arrives. **It must be corrected in the same change** — this is the false-header class, in the file
the defect is in, and leaving it would be the third time this project shipped a header claiming a
call relationship that does not exist.

### What to change

**On a successful online read of the conferences the attendee is registered for, erase the stored
copy of any conference absent from that answer.**

`EventsRepository.listRegistered()` is live, deliberately uncached, and already runs on every
online Home load. It is the one place the client learns the authoritative set, and a conference
missing from it is one the server will refuse.

**This lives in the composition root, not in `cached.ts`.** That placement is the point rather than
a detail: it is what sidesteps the objection that withdrew 009's FR-756a — no repository is given
responsibility for another's cache, and no shared classification mechanism is touched.

### Requirements

- **FIX-301**: A successful `listRegistered()` MUST erase the stored copy of every conference held
  for that attendee and absent from the result.
- **FIX-302**: It MUST NOT act on a failed or offline read. An empty answer that failed is not an
  answer that the attendee is registered for nothing, and treating it as one would erase a working
  offline copy on every connectivity blip.
- **FIX-303**: It MUST NOT be implemented inside `cached.ts` or by adding a member to `reads`,
  `passThrough`, or any per-repository classification.
- **FIX-304**: The `cached.ts` comment claiming an authorization refusal purges immediately MUST be
  corrected to state what actually happens, including that a cold start issues no refused read at
  all.
- **FIX-305**: A test MUST cover the cold-start case specifically — a stored conference, a
  `listRegistered()` answer omitting it, and the bytes gone afterwards.

---

## FIX-4 — the administrative shell has two layouts where three are required

### What is wrong

Principle IV requires three layouts, and R3 ratified MyNet's. `apps/admin`'s were **carved out of
that ratification as a defect**, on the ground that fiat may close a judgement but cannot make a
non-compliance compliant.

`AdminShell` presents two:

- **Below 768px**, the administrative site's only navigation is a horizontally scrolling strip
  (`flex gap-1 overflow-x-auto`). Principle IV's mobile layout calls for bottom navigation and
  forbids any primary action requiring horizontal scrolling.
- **At 768–1023px**, the rail is labelled at `md:w-56` rather than reduced. Principle IV's tablet
  layout calls for a reduced rail.

**The end-to-end sweep cannot see either, by construction.** `horizontalOverflow` measures
`documentElement.scrollWidth - clientWidth`, and an inner `overflow-x-auto` container exists
precisely to keep that measurement at zero. The admin sweep passes and will keep passing.

### What to change

Deliver the third layout, and assert it in a way that does not depend on document-level overflow.

**`apps/admin` imports MyNet's design tokens and uses none of its breakpoints** — it uses
Tailwind's defaults throughout. That is the origin of the divergence and it is what makes the fix
cheap: the `tablet:` and `desktop:` breakpoints are already available in the administrative app.

**R3 ratified the 768–1279px rail divergence between the two products as-is, and this fix must not
quietly reverse it.** What is being fixed is the *absence of a third layout*, not the fact that the
two products differ in the band where both have one. A change that aligns the administrative rail
to MyNet's icon-only treatment across that whole band would be reopening a ratified judgement as if
it were a defect.

### Requirements

- **FIX-401**: `apps/admin` MUST present three distinct navigation layouts across the supported
  width range.
- **FIX-402**: Below 768px, navigation MUST NOT require horizontal scrolling to reach any
  destination.
- **FIX-403**: The assertion MUST NOT rely on `documentElement` overflow. It MUST measure the
  navigation container itself — its own `scrollWidth` against its own `clientWidth` — because that
  is the measurement an inner scroll container cannot mask.
- **FIX-404**: The ratified 768–1279px divergence between the two products MUST survive. A test
  asserting the two products' rails are identical in that band would contradict R3 and MUST NOT be
  written.

---

## `LocalCache` gains two members, and that is the one structural change here

FIX-2 and FIX-3 could not be built against the three-member interface, so `LocalCache` goes to five
— in both the platform interface and its structural mirror in `packages/data`.

- **`remove(key)`** — an exact-key delete. `purge` is a **prefix** match, and FIX-203 requires
  deleting one expired entry without touching its still-fresh neighbours. No resource name extends
  another today; the day one does, `purge` would take both and the loss would be silent and
  offline-only.
- **`keys(keyPrefix)`** — which conferences this device holds. **Only the store can answer it**:
  the composition root has no memory across a reload, and a reload *is* the cold-start case FIX-3
  exists for. It returns keys and never payloads, and answers `[]` on failure — the direction that
  cannot destroy a working offline copy.

**The rejected alternative is recorded because it is the one somebody will propose next**: a
client-maintained index of cached conferences. It is a second source of truth for a question the
store already answers, and the copy that drifted would decide whether somebody's withdrawn
conference survives.

**This is NOT a device capability and does not touch Principle V's list of eight.**
`packages/platform/tests/substitution.test.ts` guards `DeviceServices`; `LocalCache` is not a
member of it, the file is untouched, and 014's obligation that it remain unchanged over its pinned
history range is unaffected.

## Feature Declarations

| | |
|---|---|
| **Actor and tier** | FIX-1 and FIX-4 concern the administrative product; FIX-2 and FIX-3 concern the attendee client. No actor gains or loses a capability. |
| **Administrative counterpart** | **None, and the direction is the reverse of the usual one.** FIX-1 *constrains* what administration may add; FIX-4 fixes an administrative layout. FIX-2 and FIX-3 are device-local and have no server or administrative half at all. |
| **Offline behaviour** | FIX-2 and FIX-3 change it and the change is stated: an aged-out entry is deleted rather than retained, and a conference the attendee has left is erased on the next successful registered-conferences read. **Neither changes what any surface displays.** No new cached read, no new `passThrough` member. |
| **Three layouts** | FIX-4 is the delivery of the third for `apps/admin`. |
| **Empty / loading / failure states** | Unchanged. FIX-2 preserves the existing "connection needed, nothing cached" outcome verbatim (FIX-202). |
| **Accessibility** | FIX-4's navigation must keep accessible labels, visible focus and keyboard operability at every width. |
| **Identity scoping** | FIX-3 acts only within the signed-in attendee's own prefix. |
| **Event scoping** | FIX-3 erases per conference; FIX-2 acts on a single entry (FIX-203). |
| **Register position** | Implements v5.4.0 R1 and R3. **Opens no entry and closes none** — 22 and 4 were closed by the amendment, not by this code. |
| **Migration number** | **None.** No schema change. |

## What this fix deliberately does not do

- **It does not shorten the cache lifetime.** R1 defers that as a product judgement that cannot be
  priced without a real conference, and explicitly not as a register entry.
- **It does not purge on an authorization refusal**, in any repository. R1 rejects that mechanism by
  name.
- **It does not touch the attribution change or the block-lookup throttle.** Those are R2's, they
  belong to 017, and R2 requires them to ship together.
- **It does not renumber the standing decisions.** The 30–35 / 30 / 31–36 collision in `CLAUDE.md`
  is real and is an owner call, not a fix.
