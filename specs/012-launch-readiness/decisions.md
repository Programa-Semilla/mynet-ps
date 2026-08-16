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

## D-012-2 — Q&A at launch (FR-1143, SC-1212)

**Staged for the owner; NOT yet taken.** T095 records the decision here when it is taken.
Today's Q&A is unmoderated, attributed "Ana R." per v5.4.0 R2 pending 017, published instantly,
and has no feature flag. Hiding or gating it retracts delivered 009 requirements and requires a
constitution amendment; leaving it live until 017 lands does not. The recording of this decision
is in 012's scope; drafting any amendment is not.

---

## D-012-3 — The client diagnostic channel (FR-1142, SC-1212)

**Staged for the owner; NOT yet taken.** T096 records the decision here when it is taken.
`apps/web/src` has exactly two `console.*` calls, both for unrecoverable faults, and the client
holds personal data — so "add a telemetry SDK" is a privacy decision, not a tooling one.
