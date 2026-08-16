# Brainstorm: 012 — Launch Readiness

**Date:** 2026-08-16
**Status:** active

## Problem Framing

The roadmap names 012 **"Launch Readiness and Production"**. Three preconditions were checked before
scoping, and two of them block the "and Production" half in ways no code can fix.

**Production cannot deploy, and that is by design.** `deploy/vm/envs/prod.env` carries
`SUBSCRIPTION=` and `APP_DOMAIN=` blank. Standing decision 31 named `mynetcr.com` *provisionally* —
not registered, not final — and forbade committing it until it is, **precisely so the deploy job's
refusal stays honest**. The owner reports registration as weeks away or uncertain.

**UAT's central compliance claim is currently false.** `deploy/vm/OPERATIONS-LOG.md` records 7
attendees, of which **4 are genuine accounts** on `gmail.com` and `programasemilla.com` created
2026-08-11/12. Standing decision 30 describes UAT as carrying *seeded data only*, with 001's FR-067
*"satisfied by the data rather than by the door"*. The log's own words: **"That is now drift rather
than fact."**

**The administrative half of the validation walk is impossible, and the obvious fix is destructive.**
`operators = 0` — the seed has not run since 013 merged, so `pnpm admin:bootstrap` has no identity to
issue a credential to. The only documented route to a credential is `pnpm db:seed`, and
`attendeeSeed.clear` is unconditional with no module argument, so it **deletes all 7 attendees**.
013's and 014's scenarios cannot be walked until this is resolved.

**Underneath all of it sits the real subject: roughly 60 outstanding by-hand scenarios.** Every
feature since 007 declared a `quickstart.md` walk and shipped without completing it — 007, 008, 009,
010, 013, 014 (both tranches) and 016. 110 scenarios exist across 12 features; about 60 are
outstanding. This is the largest single piece of undischarged obligation in the project, and it is
the part no machine can do.

**Why it matters more than the count suggests.** The only two defects a human has ever found in this
product were both **layout**, both found within minutes of somebody opening a screen, and both had
passed every automated gate: 008's scheduling dialog rendering in the top-left corner (past 135 e2e
tests, five review agents and CodeRabbit), and 010's top-bar label truncating to "M…" at every mobile
width. And **016 exists as a feature only because the owner used the deployed product and found six
things.** The evidence is consistent: real use finds what gates cannot.

**This session also inherits a fresh reason to look.** Constitution v5.4.0 (ratified 2026-08-15, one
day before this session) closed register entry 4 by **owner ratification without a client acceptance
act** — the desktop and tablet layouts are now ratified as intended, and nobody has seen them. R3
records that cost explicitly. Walking them is how that bet gets settled.

## Approaches Considered

Four questions were settled in sequence; each foreclosed part of the space.

### Q1 — Does 012 include production?

**Decided: no.** With the domain weeks away or uncertain, keeping production inside 012 would make
the feature sit blocked on something outside the repository. **012 becomes Launch Readiness; the
production deploy splits into its own phase** when a domain exists. This is a **departure from the
roadmap** and the spec must say so, following 002's precedent when it absorbed 003.

Standing decision 31 carries a constraint the production phase inherits: **UAT and production must
remain separate registrable domains**, which is what makes a UAT session cookie structurally
incapable of reaching production.

### Q2 — What to do about the 4 real UAT accounts

**Decided: they are the owner's and colleagues', disposable.** The deadlock resolves by re-seeding.
012 additionally makes recurrence structurally harder, so that the next person needing a credential
on an environment holding real data is not forced to choose between the two.

### Q3 — How to discharge ~60 outstanding scenarios

#### A: One consolidated launch script — **CHOSEN**
- Pros: tests the **seams between features**, which per-feature walks structurally cannot; one setup
  instead of seven; discharges the whole backlog in a single artifact; matches how defects have
  actually been found here (using the product, not following a feature's script).
- Cons: the derivation is itself work, and done carelessly it becomes a risk-ranked subset wearing a
  consolidated script's name. **Mitigated by making the derivation a tracked step in which every
  retired scenario is named.**

#### B: Risk-ranked subset, remainder stays open
- Pros: fastest; targets exactly what no gate can see.
- Cons: the backlog survives into the production phase, and "we walked the risky parts" is what every
  feature since 007 has effectively said.

#### C: Walk everything, feature by feature
- Pros: most faithful; the only option under which each feature's own declared validation is
  literally discharged.
- Cons: seven setups, no seam coverage, slowest by a wide margin.

#### D: Automate first, then hand-walk the remainder
- Pros: reduces the human pass.
- Cons: **this product's two real defects were both invisible to behavioural tests.** Spends the
  effort on the half that was never the problem.

### Q4 — What happens to defects the walk finds

#### Fix everything found — **CHOSEN**
- Pros: produces the most launch-ready product; no deferred-defect list to argue about later.
- Cons: **scope is unknowable in advance** — bounded by whatever a walk of 60 scenarios across two
  products, three widths and four device classes happens to surface.
- **Boundary, agreed:** a finding that requires a **decision** rather than a repair — a layout needing
  redesign, anything needing an amendment or a new capability — is **recorded as a decision, not
  silently fixed**, because 012 cannot ratify things. Everything genuinely broken is fixed however
  long it takes.

Alternatives rejected: triage-and-file (bounded, but ships known one-line defects undone);
file-everything-fix-nothing (cleanest boundary, least value); fix-what-a-client-would-see (moves the
judgement to "would they notice", which is precisely what nobody can currently answer about the
desktop layouts).

### Q5 — Breadth

**Chosen: readiness-complete, plus the remaining launch-relevant idea-inbox items.** The reasoning
accepted: the walk's scope is already unknowable, so adding items of *known* size does not change the
risk profile — and each is markedly cheaper before real attendees exist than after.

## Decision

**012 is Launch Readiness. Production splits into its own phase.** Nine items:

| # | Item | Size |
|---|---|---|
| 1 | Unblock UAT — re-seed, issue an operator credential, make the deadlock structurally unable to recur | Known, small |
| 2 | Derive one consolidated launch script from all outstanding quickstarts, organised by journey, with every retired scenario named | Known, medium |
| 3 | Walk it — attendee, organizer and operator journeys; three widths; iPhone, Android, tablet and desk | Known effort, unknown findings |
| 4 | Fix **every** defect found | **Unknown** |
| 5 | Restore decision 30 compliance — seeded data only | Known, small |
| 6 | Close the `anonymous`-prefix disclosure seam | Known, small |
| 7 | **Decide** what happens to Q&A at launch | Decision |
| 8 | Make `listRegistered`'s completeness dependency breakable rather than silent | Known, small |
| 9 | **Decide** the client diagnostic channel | Decision |

**Sequencing is forced, not chosen:** items 1 and 5 must precede item 3, because without an operator
credential the administrative walk cannot start, and walking a non-compliant environment validates
nothing about the compliant one.

**Two items are decisions 012 cannot take alone**, and both may gate work:
- **Item 7.** If the answer is "hide Q&A for launch", that temporarily **retracts delivered 009
  requirements** — retraction is what made v3.0.0 and v5.0.0 MAJOR, so it needs an amendment.
  "Leave it live" needs none. Today's Q&A is unmoderated, full-name, instantly public, **with no
  feature flag** (verified: `apps/web/src/app/agenda/SessionPanel.tsx` renders it unconditionally).
- **Item 9.** Client-side logging in a product holding personal data is a Principle VIII question.
  What is logged, and for how long, is a decision before it is code. Today `apps/web/src` contains
  exactly **two** `console.*` calls in the entire client, both for unrecoverable faults.

## Key Requirements

- **The consolidated script MUST name every scenario it retires.** A derivation that silently drops
  one is the risk-ranked subset this approach was chosen over.
- **The script MUST cover the seams between features**, not only each feature's own path — that is
  the whole justification for consolidating.
- **The walk MUST cover both products.** `apps/admin` is desk work by nature and has never been
  reviewed at any width; v5.4.0 R3 ratified MyNet's layouts but explicitly **carved `apps/admin` out
  as a defect**, and that carve-out was fixed in `fix/purge-defects-restriction-guard-admin-layout`
  without a human ever looking at the result.
- **The iPhone pass MUST include 016's T068**: install it, judge the icon against the in-app coral
  mark (register entry 28 records that they knowingly differ), and retype the composer test with a
  real keyboard.
- **The Android pass covers what iOS structurally cannot**: `beforeinstallprompt`, the install
  banner, and Web Push delivery.
- **Re-seeding MUST leave a documented, non-destructive route to an operator credential**, so this
  deadlock cannot recur on an environment holding data somebody cares about.
- **Every defect fixed MUST be traceable to the scenario that found it**, so the walk's value is
  measurable rather than asserted.
- **A finding needing a decision is recorded as a decision.** 012 ratifies nothing.

## Open Questions

- **How is 012 split into PRs?** Nine items with one of unknown size is a poor single PR. The natural
  seam is unblock-and-derive / walk-and-fix / the decisions — worth putting through
  `speckit-spex-collab-phase-split` at planning rather than deciding here.
- **Does the walk happen before or after 017?** Nothing orders them. If 017 lands first the Q&A
  decision (item 7) may become moot; if 012 lands first the walk covers a surface scheduled for
  replacement. Not resolved here because it depends on when the client answers the R2 attribution
  question, which is an outstanding obligation from v5.4.0.
- **What does "walked" mean as an artifact?** A checklist with initials, a recorded session, an
  operations-log entry? Entry 4 was closed by ratification *without* an acceptance act, so this
  project has no precedent for what recording one looks like.
- **Does restoring decision 30 compliance need more than a re-seed?** UAT has open public sign-up by
  design (decision 30 rejected basic auth and an IP allowlist as safer-looking but worse). So real
  accounts can reappear the day after a re-seed. Whether "seeded data only" is enforceable at all, or
  should be reworded to match what the environment actually is, may itself be a decision.
- **Does the production phase get a number now, or when the domain exists?** Reserving one would
  repeat the mistake v5.3.0's decision 53 fixed for migrations — reserve-in-advance collided three
  times because branches cannot see each other's reservations.
