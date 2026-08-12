# Brainstorm: The administrative product, and the second actor

**Date:** 2026-08-11
**Status:** active — decided, and **ratified as constitution v4.0.0 on 2026-08-11**

> **The amendment this session called for was drafted and ratified the same day, and a second one
> followed it.** v4.0.0 carries the decisions below as standing decisions 31–36, reverses Principle
> III's administration exclusion and D2's seed-data clause, and opened register entries **24, 25 and
> 26** — three of the Open Questions at the foot of this document, which turned out to be governance
> rather than spec detail. **v4.1.0 closed all three the same session** as decisions 37–39: a
> subdomain with host-only sessions; the report queue disclosing reported content and the reporter's
> reason, as the **third** Principle VIII exception; and organizer assignments ending with access.
> Features 013, 014 and 015 are licensed and **nothing blocks 013.**
>
> The remaining Open Questions below are for `/speckit-specify`, not for governance.

## Problem Framing

Conference content has been seeded since 001. The owner now wants "the administrative part of the
system", and observes that "so far everything has been driven by seeds".

That observation is correct, and it is not an oversight to be corrected — it is the deliberate
consequence of a prohibition this project has held since 1.0.0. **Administration is the one thing
the constitution forbids by name rather than merely omits.**

### What the prohibition actually says

Principle III, and it is worded as a WHAT rather than a delivery-mode artifact:

> Organizer administration and payment processing are out of **product** scope and MUST NOT be built
> without an amendment. Their exclusion is a WHAT, not a delivery-mode artifact.

And the seed-data clause of D2, which closes the obvious workaround before anyone reaches for it:

> Seed data MUST NOT become a route around the organizer-administration exclusion in Principle III.
> No administrative interface, no privileged role, and **no content import path** may be built
> without an amendment. Adding a conference is a reviewed change to committed seed data.

### It is wired into code, not only into prose

This is the material fact that shapes the work. The exclusion is not a paragraph somebody has to
remember; five artifacts enforce it, and each one fails a build that violates it:

| Guard | What it asserts |
|---|---|
| `apps/api/src/db/seed/catalog.ts` | "There is no write path and no import path at any privilege (FR-132, FR-134) — both would be organizer administration. Adding a conference is a reviewed change to this file." |
| `apps/api/tests/unit/catalog-read-only.test.ts` | The catalog query layer exports reads only; `CatalogRepository` declares no write method (FR-191) — asserted by name-shape over its exports, so a write method fails by existing |
| `apps/api/tests/integration/join-grants-nothing.test.ts` | "grants no write over the conference content it can read (FR-132, FR-134)"; "offers no surface that creates, changes or revokes a join code (FR-311)" |
| `apps/api/tests/unit/qa-absences.test.ts` | No answer, pin or moderation route on Q&A |
| `apps/api/tests/unit/no-report-read-surface.test.ts` | No report read surface anywhere in the product (FR-548) |

Every one of these has to be **deliberately amended** by this work. That is the design working as
intended: the guards exist so that reversing the decision is a conversation rather than a commit.

### The exclusion has been holding two register entries open

This is the strongest single argument that the work is due, and it is not the argument the owner
opened with:

- **Register entry 19 — nobody moderates uploaded avatar images.** The constitution's own note says
  public self sign-up plus image upload, "in a product with no administrative actor by construction —
  and the organizer-administration exclusion in Principle III is precisely what forecloses the usual
  answer."
- **Register entry 21 — the operator address abuse reports are sent to.** Reporting exists (007,
  extended by 009) and a report leaves the product as operator mail readable from nowhere inside it.
  The reporting dialog tells the attendee a person will read it. **That sentence is not yet true.**

009 recorded the same shape from the other direction: a public Q&A surface "needs a moderator, and a
moderator is an organizer — the actor Principle III excludes by construction."

So the product has been accumulating obligations that only an administrative actor can discharge.

### Scope assessment

"The administrative part" as stated spans four independent subsystems. Three are in scope:

1. **Conference content authoring** — events, sessions, tracks, rooms, speakers.
2. **Moderation and safety** — the report queue, Q&A removal, avatar moderation.
3. **Registration and attendee management** — join codes, who is registered, removal/suspension.

The fourth, **operator observability** (deployment health, database state, backup status,
throttle diagnostics), is **out of scope**. It can live in `deploy/vm/` as operator tooling, is not
a product surface, and needs no amendment.

Each of the three is comparable in size to 006 or 008. Together they also carry a new actor, a new
site, a new session topology and an amendment. This is a multi-feature programme, not a feature.

## Approaches Considered

### Administrator identity — how an administrator comes to exist

This is the same question decision 11 answered for attendees, and the answer there is unavailable
here: **anyone who can sign themselves up as an administrator is not an administrator.**

#### A: Seeded operator accounts only
- Pros: A separate table disjoint from `attendees`; accounts are committed reviewed seed data, the
  same rule that already governs conferences. No self sign-up, no promotion path. Leaves the
  `attendees` deletion and export coverage tests entirely untouched.
- Cons: Every operator change is a deploy. Unworkable for a real conference team.

#### B: Seeded first, then operators invite operators
- Pros: Bootstraps once, then self-sustaining.
- Cons: Puts an account-creation path inside the admin product, with its own invite and revoke
  lifecycle, for people who have no other presence in the system.

#### C: An attendee promoted to organizer
- Pros: One human, one login, one profile. Matches how conference staff actually behave — they
  attend the event they run.
- Cons: Makes "privileged role" literal, which is the exact phrase D2 forbids. Every identity-scoped
  read must now establish which capacity the caller is acting in.

#### D: Per-conference organizer, owned by whoever created the conference
- Pros: Closest to real events; limits blast radius.
- Cons: Needs an ownership model and still leaves the bootstrap problem unsolved.

**Chosen: B + C, as two distinct tiers.** Seeded accounts bootstrap the system; those accounts can
then promote an existing attendee to organizer. The two origins are *not* the same thing and the
spec must name them differently so the distinction cannot erode:

- **Platform operator** — seeded, exists before any conference does, product-wide authority, can
  promote, reads the abuse-report queue.
- **Conference organizer** — a promoted attendee, authority limited to the conferences they are
  assigned.

### Where administration lives

**Chosen: its own website**, at the owner's direction, sharing look and feel but not
information architecture.

This is a better outcome than it first appears. It keeps MyNet itself an attendee-only workspace
with no admin mode, no privileged view and no role-dependent rendering, so Principle III's
*product* framing survives the amendment nearly intact. The amendment then reads as
"administration exists as a separate product against the same data" rather than "MyNet grows a
privileged mode" — a materially smaller claim.

What is shared is `theme/tokens.css`, the 010 brand mark, and component patterns. What is **not**
shared is the five destinations, Home's card registry and the navigation contract. The admin site is
a different information architecture wearing the same clothes.

### What happens to the seed

#### A: Seed stays as the dev/test fixture; authoring is the real path — **chosen**
- Pros: One class of conference, no privileged data, no two-tier editing rules. The seed keeps the
  job it is actually good at — reproducible fixtures — including `assertDisjoint`'s two-disjoint-
  programmes property and the deliberately-empty third conference that exists so the empty state
  cannot rot. Additive: no existing test loses its fixture.
- Cons: `catalog.ts`'s "no write path at any privilege" comment becomes false and must be rewritten
  rather than deleted.

#### B: Two classes — seeded immutable, authored editable
- Pros: Test fixtures are protected absolutely.
- Cons: Two kinds of conference in one table with different rules; an organizer viewing a seeded
  event finds controls that silently do nothing.

#### C: Authoring replaces the seed entirely
- Pros: Cleanest end state; one way a programme comes to exist.
- Cons: Every integration and e2e test must author its fixture through the API before any admin
  feature delivers value. A large migration paid up front.

### Sequencing

#### A: Foundation slice carrying moderation, then authoring, then registration — **chosen**
- Pros: Moderation is the smallest of the three subsystems, so it proves the whole new architecture
  — second actor, second origin, two-tier guard — on the surface where being wrong costs least. It
  closes register entries 19 and 21 immediately, and reports are *already arriving* from 007 and 009
  with nowhere to go, so the first PR makes an existing promise true rather than only enabling
  future work.
- Cons: Defers the capability the owner actually asked about first.

#### B: Foundation slice carrying authoring first
- Pros: Delivers the stated motivation immediately.
- Cons: Authoring is by far the largest surface — write paths, validation, draft/publish state, and
  the unanswered question of what editing a *live* conference does to attendees who have already
  saved those sessions. It bets all of that on an actor model that has not been exercised once.

#### C: Pure foundation feature, then three independent siblings
- Pros: Cleanest boundaries; the shape 001 used; siblings become reorderable.
- Cons: One more feature of overhead, and a PR that lands a site which only manages its own
  operators.

## Decision

Build the administrative capability as **a separate website against the same API and database**,
introducing a **second actor in two tiers**, gated by a single **constitution amendment (v4.0.0)**,
and delivered as **three features in sequence**.

**One amendment, not three.** The second actor is a single decision; splitting it across three
amendments would let it drift. It is expected to be **major (v4.0.0)** because it retracts delivered
guarantees — the same reasoning that made v3.0.0 major for withdrawing 001's FR-066. The current
constitution is **v3.4.0**.

The amendment gates the first line of code, as v3.1.0 gated 007's Phase 7, v3.2.0 gated 008 and
v3.3.0 gated 009.

**Delivery order:**

| Feature | Contents |
|---|---|
| **013** | Amendment v4.0.0; platform-operator identity and promotion; the admin site with its own authentication and shell; **the abuse-report queue**. Closes register entries 19 and 21. |
| **014** | Conference content authoring — events, sessions, tracks, rooms, speakers. |
| **015** | Registration and attendee management — join codes, registration visibility, removal/suspension. |

Migrations run to `0008_session_qa.sql`; **013 reserves `0009`.** The delivery roadmap's reserved-
number table stops at the shipped programme and must be extended.

## Key Requirements

Agreed during this session. These feed the spec, they are not the spec.

1. **Administration is a separate website.** MyNet itself gains no administrative surface, no
   privileged view and no role-dependent rendering. This is testable as an absence and should be.
2. **Two tiers, named distinctly.** A *platform operator* is seeded, product-wide, and is the only
   tier that may promote or read the report queue. A *conference organizer* is a promoted attendee
   whose authority is limited to conferences they are assigned.
3. **No self sign-up into either tier.** Platform operators are committed seed data; conference
   organizers exist only by promotion.
4. **A conference organizer is a real attendee** with a real profile, who continues to use MyNet as
   an attendee. Promotion adds capability in the admin product; it must not alter their attendee
   experience.
5. **The seed remains the dev and test fixture.** Seeded conferences are ordinary editable
   conferences. `assertDisjoint` and the deliberately-empty third conference survive.
6. **One class of conference.** No privileged or immutable content.
7. **The report queue is the first administrative capability**, because reporting already promises a
   human reader and does not yet have one.
8. **Shared visual language, separate information architecture.** Tokens, brand mark and component
   patterns are reused; the five destinations, Home's card registry and the navigation contract are
   not.
9. **Operator observability is out of scope** and belongs in `deploy/vm/`.
10. **Every guard listed in the Problem Framing is amended deliberately**, with its replacement
    stating what is now permitted and to whom. None may be weakened until it stops checking anything
    — the failure mode 009 named for its absence guards.

## Open Questions

To be resolved in the spec phase, or escalated to the owner where they are decisions rather than
details. **None may be silently resolved.**

- **A promoted organizer can delete their own account.** Standing decision 12 makes deletion
  self-serve, complete and cascading with no tombstone. If the only organizer of a conference
  exercises that right, the conference is orphaned by a guaranteed action — and the sessions they
  authored are conference content, so they survive, ownerless. Neither the deletion guarantee nor
  the ownership model can simply win.
- **Does withdrawing from a conference revoke an organizer assignment for it?** 008 established that
  withdrawal cancels live meetings in the same transaction. The analogous question here is
  unanswered.
- **The admin site needs its own session topology.** Standing decision 19 — one origin for client
  and API — is load-bearing: it is what keeps `SameSite=Lax` a genuine CSRF defence and makes
  `connect-src 'self'` literally true. A second site is a second origin and cannot inherit that
  reasoning unexamined. This is the same trap v3.0.0 was written to escape, where the previous
  configuration *could not sign anyone in*.
- **What does the report queue disclose?** The operator mail deliberately carries identifiers and a
  timestamp, never message text and never the reason (decision 23). If an operator can now read
  reports in a product surface, does that surface show the reported content? Message content is the
  most sensitive data in the product, and Principle VIII requires an exception to be *recorded*
  rather than derived — as v3.3.0 required for Q&A visibility.
- **What may a moderator actually do?** Removing a question, suspending an attendee, and replacing
  an avatar are three different powers with three different reversibility stories. 009 established
  that a withdrawn question takes everybody's votes with it; a *moderator*-removed question is not
  obviously the same case.
- **Does an organizer appear in Discover, and can they be blocked?** They are an attendee, so by
  default yes. Blocking a moderator is a coherent attendee action with incoherent consequences.
- **What does editing a live conference do to attendees who saved the affected sessions?** Moving or
  deleting a session that sits in somebody's Agenda, or on Home's "Up next" card, has no defined
  behaviour today. This is 014's central problem and is worth naming now.
- **Is "organizer" the right word?** It is the exact term Principle III uses for the excluded actor.
  Reusing it makes the amendment's diff read clearly; it also makes every older comment in the
  codebase ambiguous.
- **Deletion and export coverage for the new tables.** `deletion-coverage.test.ts` and
  `export-coverage.test.ts` derive expectations from the Drizzle schema, so **a new table or column
  fails by existing**. Operator records are personal data about a person who is not necessarily an
  attendee, which is a case Principle VIII has never had to consider.
- **Is the admin site installable?** MyNet is a PWA with a manifest, icons and a service worker. The
  admin site probably should not be, and that should be a stated absence rather than an omission.

### Housekeeping noticed while gathering context

Not part of this brainstorm, recorded so it is not lost:

- **`CLAUDE.md` is stale in two places.** It cites the constitution as v3.3.0 (actual: **v3.4.0**,
  and `brainstorm/00-overview.md` agrees) and says migrations run to `0007` (actual: **`0008`**).
  The constitution requires `CLAUDE.md` to stay consistent with it.
