# Review Guide: App fixes, mutual card exchange, and the install icon

**Generated**: 2026-08-12 | **Spec**: [spec.md](spec.md)

## Why This Change

The project owner used the deployed product and brought back six things. Three are defects verified
against source rather than accepted as reported symptoms: the message composer grows without a bound
until its send control leaves the viewport, so **a sufficiently long message cannot be sent at all on
a phone** — the product's primary context; the conversation list loads once on mount and never again,
so it sits frozen beside a thread that polls every three seconds; and no confirm-password field
exists in MyNet, on either of the two forms that set a credential.

**This is the second time a person has found what the gates could not.** 008's scheduling dialog
shipped rendering in the top-left corner having passed 135 e2e tests, five review agents and
CodeRabbit. The composer defect is the same class — the control exists, is labelled, is focusable and
submits, so every behavioural assertion passes it. That pattern now has two data points and it is
why two of this feature's acceptance criteria are deliberately judged by a human.

## What Changes

Attendees get a composer that stops growing, a conversation list that stays current while they are
looking at it, a reveal control on every password field across both products, and a confirmation
field where MyNet was missing one. **Sharing a digital business card becomes a mutual exchange**:
one tap and both people hold each other's card, where previously sharing gave yours and took nothing.
The sign-in screen tells an uninstalled phone that installing is what enables notifications, and the
home-screen icon becomes the owner's new mark.

**The breaking change is governance, not API.** No route is added or removed and no payload shape
changes; what changes is that one call now establishes a relationship in both directions.
`GET /cards/shared` keeps its query and rows but is **redefined** — it has meant "cards you have
given away" since 008 and would now return rows the reader never consciously gave.

**No migration. No new table, no new column.** `0010` stays reserved for 012.

## How It Works

**The approach is almost entirely inheritance.** Every mechanism already exists and is documented
with its reasoning: the transaction shape from 013's audit writes, the poll shape from 007's thread,
the derived-asset discipline from 010, and the share guard from 008.

- **Mutual exchange** restructures `shareCard` onto `getDb().transaction()` and writes two
  `shared_cards` rows inside it. Three properties 008 designed are why this needs no migration: the
  unique constraint is **directional and unnormalised**, so A→B and B→A coexist; `ON CONFLICT DO
  NOTHING` already delivers idempotency; and both foreign keys cascade while export already runs one
  query per direction. The guard is evaluated **once** and governs both inserts.
- **The list refresh** reuses the thread's poll shape — visible-only, jittered, backing off to a
  ceiling, three-failure threshold — at 10 seconds rather than three, plus one condition the thread
  does not have: it pauses when the layout has replaced the list with a thread.
- **Install detection** goes behind a **new eighth device capability** in `packages/platform`.
- **The install icon** derives through a **separate script beside** the board pipeline, not a
  parameterisation of it.

Full detail in [plan.md](plan.md), [research.md](research.md) and
[contracts/api-changes.md](contracts/api-changes.md).

## When It Applies

**Applies when**:
- An attendee composes a message at any width, and especially on a phone with the keyboard raised
- The Messages destination is open and the conversation list is **on screen** — on mobile a thread
  replaces the list, so refreshing pauses there
- Anyone enters a password on any of five screens across MyNet and the administrative site
- An attendee shares a card with a co-attendee who is **discoverable and verified**
- A reader signs in on an uninstalled mobile browser
- A device installs MyNet to a home screen

**Does not apply when**:
- The recipient of a card is undiscoverable, unverified, or not registered — the exchange is refused
  with a reasonless 409 indistinguishable from every other refusal on that route
- The reader is on desktop or already installed — no install guidance renders
- The administrative site's favicons and every in-app mark — **deliberately unchanged**, keeping the
  two-mark divergence scoped to one product
- Anything touching the credential policy — this changes how a password is *typed*, never what is
  accepted

## Key Decisions

1. **Mutual exchange is argued from disclosure, not from the physical-card metaphor.** The metaphor
   was available and is insufficient: v3.2.0 N2 was never argued from metaphor, so a metaphor cannot
   unmake it. The operative ground is that a card resolves only what its owner **already published to
   co-attendees** under standing decision 16, so the exchange moves *when* those fields are seen, not
   *whether*. The client reached the same position independently (REQ-046 of the feedback extraction).

2. **FR-1053's discoverable-and-verified guard is load-bearing for the reversal itself.** Against a
   non-discoverable recipient, C1's licence collapses — they published nothing, so the exchange
   *would* disclose something discoverability had not. **Relaxing this guard requires another
   amendment, not a code review.** It was the one question `/speckit-clarify` had to settle.

3. **`GET /cards/shared` is redefined rather than withdrawn.** It has no consumer, so removing it
   would break nothing — but it is the only route its branded scope guard covers, and this project
   has twice recorded that the guard is what makes adding a card-named route safe by default.

4. **The install capability is an interface plus an amendment, not a lint exemption.** The
   constitution's own reasoning for `VisibilityService` applies unchanged: *"an exemption would have
   traded a structural boundary for a poll interval."* Here it would buy an install banner.

5. **The password reveal control is implemented twice, deliberately.** `apps/admin` depends on
   `@mynet/data` and `@mynet/config` only — deliberately not `@mynet/platform` — and no shared UI
   package exists. Creating one for a single control would give the administrative site its first
   dependency on shared *presentation*, the coupling v4.0.0 kept out on purpose. **Divergence is
   prevented by the same assertions running in both products**, so drift fails a build.

6. **The install icon is a separate derivation path, not a parameterised pipeline.** The board
   script's crop rectangle, plate derivation and safe-zone maths are measured against one specific
   1254×1254 image; a flag-selected constant set is how the wrong constants apply silently.

## Areas Needing Attention

**Where to concentrate, in order:**

1. **Check FR-1053's guard is intact in the implementation.** It is the whole licence for the
   reversal. If it is weakened, softened, or made conditional, the amendment's argument no longer
   holds and the change needs re-ratifying rather than re-reviewing.

2. **Four review-gate findings shared one root cause, and it will recur.** Mutual exchange changes
   the meaning of things 008 built, and the first draft described new behaviour without describing
   what it invalidated. **Two comments become false with no test that would fail** — T041 redefines
   the route summary, T042 rewrites the export docblock that justifies disclosure by citing the very
   rule being reversed. Verify both landed; nothing else will catch them.

3. **T032's atomicity test must use a real constraint or trigger, never a mock.** Mocking the query
   layer proves nothing about the transaction, which is the entire subject of the test. A green
   `cards-atomicity.test.ts` that mocks is worse than no test — it asserts the property is checked
   when it is not.

4. **Two planning discoveries the spec and its review gate both missed**, which is worth noting about
   process rather than about this code: install detection needed an eighth capability, and the
   reveal control had nowhere shared to live. Both surfaced only when someone read the lint rule and
   the admin `package.json`.

5. **The card-share throttle now admits twice the write volume** at the same request rate, since one
   call writes two rows. T044 re-checks it rather than inheriting the number.

6. **The reciprocal row's event scoping is asserted, not inherited** (T033a). Standing decision 7
   forbids assuming either scoping rule — a card records the conference as a historical fact and is
   never scoped by it.

## Open Questions

Two, both deliberate and neither blocking:

1. **Is "found on your next visit to Network" enough** for a card acquired by somebody else's act?
   Under one-directional sharing, contacts only grew by the reader's own reciprocation, so there was
   nothing to announce. Mutual exchange makes acquisition passive, FR-1029 forbids a notification, and
   FR-1030 records that **no Home card exists and none may be added** (guarded by T037a). The
   behaviour is fully specified; whether it is *good* is the question C1 creates and nobody has asked.

2. **The exact proportion for the composer bound.** FR-1002 fixes that it *is* a proportion of the
   visible thread area; the value is a planning decision recorded in the implementation.

**Register position** — three entries a reviewer should check are stated correctly and not quietly
moved: entry **28** must stay **OPEN** (two brand marks now coexist by the owner's explicit
direction); entry **4** is **escalated a third time, not closed**; entry **27** blocks feature 017,
**not this one**.

## Review Checklist

- [ ] Key decisions are justified
- [ ] Breaking changes are documented with migration guidance
- [ ] Scope matches the stated boundaries
- [ ] Success criteria are achievable
- [ ] No unstated assumptions
- [ ] **FR-1053's discoverable-and-verified guard is intact and evaluated once for both inserts**
- [ ] **Both card records commit in one transaction, proven by a test that induces a real failure**
- [ ] **The redefined route summary and the rewritten export docblock both landed** (T041, T042)
- [ ] **No in-app mark changed**, and the administrative favicons are untouched
- [ ] **US5 did not start before its amendment** (T045) — Principle V's list must say eight
- [ ] **Register entry 28 is still open**; entry 4 is escalated rather than closed
- [ ] **SC-1001 and SC-1009 were walked on a physical phone** (T068), not inferred from green tests

---

<!-- Code phase sections are appended below this line by the phase-manager command -->
