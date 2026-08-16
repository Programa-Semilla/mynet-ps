# 012 — Decisions recorded under FR-1131

This file exists because FR-1131 forbids resolving a decision-shaped finding by silently fixing
it. Each entry names what was decided, who decided it, and why it is the size it is. **This
feature ratifies nothing** — an entry here records a decision already taken by the owner, or
stages one for the owner to take; it does not take one on their behalf.

---

## D-012-1 — The offline cold start no longer resolves an identity (SC-1207, FR-1140)

**Decided by the owner, 2026-08-16** (research R3 records the decision and its date; the plan's
post-Phase-0 re-evaluation carries it). Recorded here **before** the change was made, per T031's
ordering and FR-1131.

**What changes.** `getCurrent` stops being a cached read and becomes a declared `passThrough`
member. An offline cold start — an installed PWA launch presenting no credential — can therefore
no longer resolve the previous attendee's identity from IndexedDB, adopt their identifier as the
cache scope, and serve their programme, saved sessions and private notes. That is SC-1207 closed:
the four-case analysis in research R3 shows the only case this costs is also the only case whose
existing protection (`cached.ts`'s revocation handling) *cannot* work offline, because the
revocation is a server fact and no server is present.

**What it costs, stated rather than softened.** *"Arrive at the venue with no signal, open MyNet,
read the programme"* stops working — an installed PWA launch is a fresh document every time, so
the cold start is the one path that needed the cached identity. The degraded state the attendee
meets is already built and already worded (`active-event.tsx`). A tab that resolved its identity
while online keeps its offline behaviour unchanged; FR-215 survives for every path except the
cold start.

**Why this narrows FR-215 rather than retracting it, and why that is MINOR.** The practised test
— applied at v3.0.0 (MAJOR: withdrew delivered FR-066), v5.0.0 (MAJOR: retracted two delivered
guarantees) and v5.4.0 (MINOR: narrowed FR-702's rendered form, withdrew nothing) — is that
**withdrawing** a delivered requirement is MAJOR while **narrowing** one is MINOR. FR-215's field
reading ("the active conference's programme is readable with no connection") survives for every
signed-in session; what is narrowed is one entry path — the cold start with no resolvable
identity — and it is narrowed because serving it is indistinguishable, client-side, from serving
a stranger holding the device (R3's structural finding: offline, the owner and a stranger are the
same caller). Principle VIII outranks a convenience reading of FR-215, and v5.4.0 R1 already
struck the register's claim that this cache held no personal data.

**Owner-signed**: the decision is the owner's, taken 2026-08-16 and recorded in research.md R3
("**do not cache `getCurrent`** … The offline cold start is lost, and that is an owner decision
taken 2026-08-16"). This entry restates it in the durable place FR-1131 requires; it does not
re-take it.

---

## D-012-2 — Q&A at launch: it stays LIVE as shipped (FR-1143, SC-1212)

**Decided by the owner, 2026-08-16, interactively in session (T095).** Production may launch with
today's Q&A exactly as 009 shipped it — unmoderated, attributed by full real name, published
instantly, no feature flag — with **reporting (FR-781) as the safety mechanism** until 017's
moderated model replaces the surface. No constitution amendment is required, because nothing
delivered is hidden, gated or retracted.

**The cost is recorded rather than softened**: the client's own feedback drove v5.0.0 C2's
retraction of this model, and this decision accepts that her concern — instant public
attribution with no moderator — stays live in production for whatever gap exists between launch
and 017 landing. The alternatives weighed: *launch waits for 017* (rejected — the owner chose
not to couple the launch date to 017's delivery) and *hide Q&A at launch* (rejected — it
retracts delivered 009 requirements and needs an amendment plus a gating feature). **This
decision does not reorder anything**: 017 remains startable and remains the replacement; the
sooner it lands, the shorter the accepted gap.

---

## D-012-3 — The client diagnostic channel: a third-party crash-reporting SDK, DECIDED but not
licensed to land without its own feature (FR-1142, SC-1212)

**Decided by the owner, 2026-08-16, interactively in session (T096).** The client is to gain a
**Sentry-class third-party crash-reporting SDK**. The alternatives — no channel at all, and a
minimal first-party error beacon — were presented with their costs and not chosen.

**What this decision records, and deliberately does NOT skip over.** 012's scope is to record the
decision; building it is a feature of its own, and four consequences travel with it, each the
kind this project refuses to discover mid-implementation:

1. **It is a Principle VIII event.** A new vendor processing data from a client that holds
   messages, notes and identity is a disclosure-surface decision — at minimum a recorded
   register-entry-class decision on what the SDK may capture (an unhandled error's stack can
   embed personal data in ways no scrub list fully closes), retention at the vendor, and the
   data-processing relationship.
2. **It touches a recorded invariant by name.** Decision 19's ground for one origin is that it
   makes `connect-src 'self'` *literally true*; an SDK endpoint widens `connect-src`, so the
   building feature must either proxy the reports through MyNet's own origin (keeping the
   invariant literal) or record the exception explicitly — it must not quietly widen the CSP.
3. **The vendor gets a lint boundary**, exactly as storage, mail and push have: the SDK confined
   to one directory, chosen by configuration, absent in every environment where its keys are
   absent.
4. **It needs its own Feature Declarations row-set** — deletion/export coverage does not reach a
   vendor's servers, and the feature must say what that means for decision 12's erasure promise.

**Until that feature is specified and shipped, the shipped state — two `console.*` calls, nothing
leaving the device — remains the product's diagnostic channel.**

---

## D-012-4 — UAT is deployed BY HAND, and CI's deploy job is inert by decision (T057)

**Decided by the owner, 2026-08-16, interactively in session.** UAT receives builds via
`deploy/vm/deploy.sh` run by an operator; the `deploy-uat` job stays deliberately inert, and
**FR-1120a is amended in this change** to name the hand deploy as the mechanism (the decision's
own required act, per T057).

**Context that forced the choice**: the designed `AZURE_CREDENTIALS` service principal cannot be
minted by the signed-in account — a guest in the tenant, without app-registration rights — and
the two available acquisition routes (a tenant-admin device-code login, or an OIDC managed
identity requiring a rewrite of the deploy job's auth) were both offered and declined in favour
of the decision T057 itself names as the second branch.

**Consequences, recorded**: 011 scenario 9 steps 1–4 (merge → CI deploys with nobody running a
script) are **retired by decision**, not blocked — the mechanism they describe is one the owner
decided against; steps 5–7 (the door closes behind a deploy) remain walkable at any hand deploy.
The `deploy-uat` job's inert message now states the decision rather than a pending credential,
so reactivating it reads as what it is: a reversal to record, not a configuration task.
