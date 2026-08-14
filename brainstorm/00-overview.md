# Brainstorm Overview

Last updated: 2026-08-12 — **#10 and #11 land a client feedback round that reverses two amendments
ratified in the previous 72 hours** (v3.2.0's one-directional card, v3.3.0's Q&A attribution),
decomposes `assets/feedback-1.md` — 118 requirements from a 52-minute client conversation — into
five features, and **absorbs them into the administrative programme** rather than running a third
track. A new standing rule arrives with them: every App capability must state its administrative
counterpart, or state that it has none.

Earlier that day (**the delivery roadmap is complete**. Two sessions numbered #08 ran in
parallel and both shipped: the **brand mark and application icons**, ratified as constitution
**v3.4.0**, closing register entry 2 — the oldest in the register; and **UAT deployment and
pre-public hardening**, ratified as **v3.5.0**. MyNet is deployed and serving at
`mynet-dev.programasemilla.com`.

Then #09 brainstormed **the administrative product** — the first work to require reversing a
Principle III *prohibition* rather than an omission — ratified as **v4.0.0**, the project's first
MAJOR bump since v3.0.0, with **v4.1.0** following in the same session to close the three entries
v4.0.0 opened. It opens a **second programme** of three features, delivered from **012** because
011 was taken by the UAT work while the administrative branch was in flight.

**013 has since shipped** ([#20](https://github.com/Programa-Semilla/mynet-ps/pull/20)), and **#10
brainstormed 014 — conference content authoring**, the second feature of that programme. Its
amendment **v5.2.0 was ratified on 2026-08-12** as standing decisions 45–49, carrying two changes: a
**second notification trigger** — the first since v3.1.0 bounded delivery to a received message and
nothing else — and an explicit statement that a conference organizer may **create** a conference,
which decision 32's "only conferences they are assigned" did not anticipate. It opens register
entries 29 and 30 and closes none. **014 is specified, planned and unblocked**)

The authoritative registers live elsewhere — open questions in `.specify/memory/constitution.md`,
delivery sequence in `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`. This file
is the working index a brainstorm session reads first. When it disagrees with either of those, they
win and this is stale.

## Sessions

| # | Date | Topic | Status | Artifact |
|---|------|-------|--------|----------|
| 01 | 2026-08-04 (revisited same day) | foundation-slice | shipped (PR #2) | `specs/001-production-foundation/` |
| — | 2026-08-06 | delivery decomposition | recorded, ratified in constitution v2.1.0 | `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md` |
| 02 | 2026-08-06 | event-context-and-catalog | shipped (PR #6) | `specs/002-event-context-and-catalog/` |
| 03 | 2026-08-07 | agenda-and-saved-sessions | shipped (PR #8) | `specs/005-agenda-and-saved-sessions/` |
| 04 | 2026-08-07 | attendee-identity-and-profile | shipped (PR #12) | `specs/004-attendee-identity-and-profile/` |
| 05 | 2026-08-07 | discover-and-the-deployment-platform | ratified in constitution **v3.0.0** | `specs/006-discover-and-deployment-platform/` |
| 06 | 2026-08-07 | messages-and-notification-delivery | **implemented in full**, including Web Push; its amendment ratified in constitution **v3.1.0** | `specs/007-messages-and-notification-delivery/` |
| 07 | 2026-08-10 | network-and-appointments | **specified, then implemented**; entries 7, 8 and 9 ratified in constitution **v3.2.0** | `specs/008-network-and-appointments/` |
| 08 | 2026-08-10 | brand-mark-and-app-icons | **specified, then implemented**; register entry 2 ratified in constitution **v3.4.0** | `specs/010-brand-mark-and-app-icons/` |
| 08 | 2026-08-10 | uat-deployment-and-hardening | **shipped (PR #19)**; five owner decisions ratified in constitution **v3.5.0** | `brainstorm/08-uat-deployment-and-hardening.md` |
| 09 | 2026-08-11 | administrative-product | **decided, and ratified as constitution v4.0.0** the same day — standing decisions 31–36. Opened entries 24, 25, 26; **all three closed by v4.1.0** as decisions 37–39. Delivered as **012** | `brainstorm/09-administrative-product.md` |
| 10 | 2026-08-12 | conference-content-authoring | **decided, and ratified as constitution v5.2.0** (drafted as v5.2.0) the same day — standing decisions 45–49; opens entries 29 and 30. Specified, planned and **implemented**: 51 FRs, 105 tasks. Live editing from day one; **cancel replaces delete once attendees have engaged**; an in-app marker **and** a push for a changed saved session; both tiers create conferences. One PR, migration `0011` | `brainstorm/10-conference-content-authoring.md` |
| 10 | 2026-08-12 | app-fixes-and-install-icon | **active** — six owner items from using the running product. Two are not what they look like: mutual card exchange **reverses v3.2.0 N2**, and the new icon is a *different mark* rather than a new size. Feeds **016** | `brainstorm/10-app-fixes-and-install-icon.md` |
| 11 | 2026-08-12 | client-feedback-programme | **active** — decomposes `assets/feedback-1.md` (118 requirements, 19 areas) into five features. **Absorbs into the administrative programme** rather than running beside it. Reverses **v3.3.0** 48 hours after ratification. Feeds **017, 014, 015, 018, 019** | `brainstorm/11-client-feedback-programme.md` |

**There are two session 10s, and the duplicate is left in place rather than renumbered.** Both were
held on 2026-08-12, on branches that could not see each other, and both files exist on disk under the
number their own session used. Renumbering either would break the citations already written into a
constitution amendment, a specification and a review-findings document. The rule this project keeps
relearning applies here too: a shared numbering table needs extending in the same change that claims
a number, and a brainstorm number is one of those tables.

Session 05 has no document of its own: 006 was specified without one, and the row records the
session rather than a file. 009 likewise — it went straight to specification, and its row is
recorded here so the sessions table and the delivery queue can still be read against each other.

## What 007 delivered, and what it deliberately did not

**Delivered and green**: private 1:1 conversations, permanent and independent of the active event;
the thread with its three-second visible-only poll; block and report, both server-enforced, with
reports leaving the product as operator mail nothing inside it can read; per-participant unread
state and Home's indicator; and deletion honesty in both directions.

**Delivered after the amendment**: Web Push (User Story 5). It implements owner decision **M4**,
which register entry 10 forbade until **constitution v3.1.0** resolved that entry in part —
delivery in, for a received message and nothing else; **the bell and an in-app notification centre
still out**. The same amendment ratified the two things needing it alongside: the
`VisibilityService` capability — a seventh where Principle V named six — and the operator address
abuse reports are dispatched to. That is why this session is numbered 06 while the phase it covers
is 007.

**What that half is**: a vendor-free `PushService` port with a recording sink adapter, per-device
subscriptions keyed on the endpoint, a hand-written service worker carrying the offline shell's
behaviour across from the generated one, and a permission surface that explains itself before it
asks. **It ships unconfigured on purpose**: with no VAPID keys and no provider — register entry 20,
still open — the sink records, the client never asks, and Messages is unaffected, because FR-552
makes a denied permission a *complete* product rather than a degraded one.

**Outstanding**: T148 — walking `quickstart.md` by hand with two browser profiles. Scenario 5 was
walked and **found two defects nothing else could**: `pnpm start` could not register a service
worker at all (so notifications were untestable from the one-command setup), and a private window
cannot hold a push subscription while the product told the attendee to "try again". Scenarios 1–4
and 6 are still unwalked, and it remains the only review the two-pane desktop layout has had.

**The provider half of register entry 20 turned out not to exist.** Web Push signs with the
project's own VAPID pair and posts to whatever endpoint the browser issued — no account, no SDK, no
third party. What is genuinely open is key custody per environment and rotation. The constitution
still words the entry as "the push provider" and should probably be amended.

## Delivery queue

Eight phases after the foundation — the roadmap's nine, less 003, absorbed into 002 by brainstorm
#02. Full detail, dependency reasoning, and reserved migration numbers are in the roadmap; this is
the index, and it now differs from the roadmap in the ways #02 records.

| # | Phase | Status | Blocked by |
|---|-------|--------|------------|
| 002 | Event Context, Session Catalog & Home Composition | **shipped** — 89/89 tasks, squash-merged to `develop` ([#6](https://github.com/Programa-Semilla/mynet-ps/pull/6)) | — |
| 003 | ~~Session Catalog~~ | **absorbed into 002** (#02); migration `0002` transfers | — |
| 004 | Attendee Identity, Personal Data & Profile | **shipped** — 131/131 tasks, squash-merged to `develop` ([#12](https://github.com/Programa-Semilla/mynet-ps/pull/12)); scope well beyond the roadmap's | — |
| 005 | Agenda | **shipped** — 94/94 tasks, squash-merged to `develop` ([#8](https://github.com/Programa-Semilla/mynet-ps/pull/8)) | 002 ✓ |
| 006 | Discover, and the deployment platform | **implemented** — awaiting the two owner decisions that gate the first deploy (a domain, an Azure subscription). Migration `0005`: five indexes and one extension, **no new table and no new column** | 004 ✓ |
| 007 | Messages **and the notification-delivery platform** | **shipped** — squash-merged to `develop`. Web Push delivers for real, verified end to end on a desktop. T148's by-hand walkthrough is partial (scenario 5 only) and carries forward. Migration `0006` | 004 ✓, 006 ✓ |
| 008 | Network & Appointments | **implemented** — 149 tasks, FR-601–FR-659. Migration `0007` adds three tables under **two different scoping rules**: `shared_cards` cross-event, `appointments` and `meeting_slots` per-event. A **third** branded scope and a **third** route audit (`CardScope`, `card-audit.test.ts`), because a card route names no conference and `event-scope-audit` walks past it. T148's by-hand walkthrough is outstanding | ~~connection model~~ ✓, ~~card-exchange semantics~~ ✓ |
| 009 | Session Q&A | **shipped** — squash-merged to `develop` ([#17](https://github.com/Programa-Semilla/mynet-ps/pull/17)); its amendment ratified as **v3.3.0**. Migration `0008` | ~~question attribution~~ ✓ |
| 010 | Launch Readiness — **brand mark and application icons** | **shipped** — FR-800–FR-850, amendment ratified as **v3.4.0**. Replaces the three deliberately-ugly provisional icons, adds the favicon and `apple-touch-icon` that `index.html` has **never had**, puts the mark on the rail, top bar and five auth screens, and adds a gate that fails a **declared icon with no file** — which nothing catches today. Scope is core-only; splash matrix, monochrome and the vector redraw are booked follow-ups. **No migration**, so it does not contend with 009's `0008`. **Takes the brand gate only** — the rest of Launch Readiness stays outstanding | ~~brand assets~~ ✓ (owner supplied 2026-08-10); ~~register entry 2~~ ✓ (v3.4.0); palette adoption is new entry 23; client validation of desktop still open |
| 011 | **UAT Deployment & Pre-Public Hardening** — *rescoped from the roadmap's 010* | **shipped** — six abuse paths closed, SMTP mail, provisioned and serving at `mynet-dev.programasemilla.com`; amendment ratified as **v3.5.0** | — |
| 012 | **Launch Readiness & Production** | queued | client validation of desktop and tablet (entry 4); register entry 22; production domain |

### A second programme: administration (#09)

**The roadmap above is complete.** Every phase 001–010 is delivered, and every destination
`requirements.md` names answers its question. What follows is not the roadmap's remainder — it is a
new programme, opened by the owner on 2026-08-11, and it is the first work in this project that
requires reversing a Principle III **prohibition** rather than filling an omission.

| # | Phase | Status | Blocked by |
|---|-------|--------|------------|
| 013 | Administrative foundation — second actor, admin site, **abuse-report queue** | **shipped** — squash-merged to `develop`; amendments ratified as **v4.0.0** and **v4.1.0**. Migration `0009` | ~~24, 25, 26~~ — **all three closed by v4.1.0** |
| 016 | App fixes, mutual card exchange, install icon | **brainstormed** (#10). Amendment: reverses **v3.2.0 N2**, records the icon-upscale exception, ratifies the admin-counterpart rule. **No migration** | — |
| 017 | **Q&A rebuilt** — moderation, identity, lifecycle, projection | **brainstormed** (#11). Amendment: reverses **v3.3.0** attribution and retracts shipped 009 FRs | 013 |
| 014 | Conference content authoring — **rescoped and kept whole** | **OPEN, AND DELIBERATELY SO** (decided 2026-08-14). #10's scope is **implemented and green** on `spec/014-conference-content-authoring` (51 FRs, 105 tasks, migration `0011`, amendment **v5.2.0**), authored before #11 existed. #11's additions — event types, optional sessions with capacity and enrolment, the profile taxonomy — are **in scope and not built**. The feature closes when both are done. See the note below the table | 013 ✓; v5.2.0 ✓. The profile taxonomy is blocked on **the client's interest, sector and subsector lists, which do not exist**; the rest is unblocked |
| 015 | Registration and **invitations** — rescoped | **re-brainstormed** (#11). Completes standing decision 11 rather than reversing it | 013 |
| ~~015~~ | ~~Registration and attendee management~~ | superseded by the row above; #09's scoping is read as replaced by #11's | — |
| 018 | Profile QR | **brainstormed** (#11) | 014 |
| 019 | Event lifecycle and post-event material | **brainstormed** (#11). Carries **notification triggers 2 and 3**, and the question of whether this product gains a job runner | 014, 017 |

**#11 replaces #09's three-feature table.** The client conversation of 2026-08-12 arrived after the
attendee roadmap completed, and most of what it asks for has an administrative half — so it absorbs
into this programme rather than running beside it. Two programmes authoring the same
conference-content tables is the implicit coupling this project has already had to fix twice.

**016 and 017 take the next free numbers rather than the next numbers in this sequence**, which is
now the third time this has happened (011 over the administrative programme, 013 over its own
sequence, and now these). It is not worth correcting; parallel reservations cannot see each other
and the number settles at merge.

### 014 is built to #10's scope and rescoped by #11 — DECIDED 2026-08-14: it stays open and grows

**This is the same collision as the numbering, arriving on scope instead**, and it is the one place
in this merge where the honest answer was to record the conflict rather than resolve it.

`spec/014-conference-content-authoring` was branched before #11 existed and implements #10's 014 in
full: tracks, rooms, speakers and sessions authored by an assigned organizer or a platform operator,
live-edited with no draft lifecycle, cancel-not-delete once anyone has engaged, the second
notification trigger and the per-row marker. It is complete, reviewed, and green.

#11 then decided — on `develop`, on the same day — that 014 "grows rather than being duplicated" and
also carries **event types, optional sessions with capacity and enrolment, and the profile taxonomy**
(REQ-010–014, 027–042, 078–086, 113–115). None of that is built, and #11 itself records the blocker:
the client's interest and subsector lists do not exist.

**Three ways to reconcile were put to the owner on 2026-08-14, and the second was chosen:**

1. Ship what is built as 014 and move #11's additions to a new feature.
2. **Hold 014 open and grow it to #11's scope. — CHOSEN.**
3. Ship as 014 phase 1, with #11's additions as 014 phase 2 in the same feature directory.

**What the decision means, stated so it is not softened later.** 014 is **not complete** and its
specification must not claim to be. #11's "rescoped and kept whole" is honoured literally: this is
one feature carrying both scopes, and it closes when both are built. The cost is accepted rather
than hidden — a complete, reviewed, thirteen-gates-green body of work waits on a client artifact
that does not exist, and the wait has no known end.

**What remains, and what it is blocked on:**

| Added by #11 | Requirements | Blocked on |
|---|---|---|
| Multiple event types; agenda items with base information; virtual sessions carrying an access link; presenters in the event model | REQ-010–014 | nothing |
| The profile taxonomy — sector, subsector, short productive-activity description, networking interests chosen from predefined options, optional company name | REQ-027–042 | **the client's interest, sector and subsector lists (REQ-033, REQ-034, REQ-036), which do not exist** |
| Optional sessions with a maximum capacity, explicit enrolment, and per-activity closing rules and deadlines | REQ-078–086 | nothing |
| An administrative interface for creating events | REQ-113–115 | **already delivered by the built tranche** |

**One row of that table is worth reading twice.** REQ-113–115 asks for exactly what this branch has
already built, so #11's rescope is not four additions to an unbuilt feature — it is three additions
to a feature whose original request is done. Two of the three are unblocked today; only the profile
taxonomy waits on the client, and it waits on a *list*, not a decision.

**#11's reasoning for absorbing rather than paralleling stands and is why this choice is coherent**:
two programmes writing the same conference-content tables is the implicit-coupling failure this
project has already fixed twice. Splitting 014 would have recreated it.

**Numbered 011–013 when #09 ran, and delivered as 013–015.** The UAT deployment work took 011 from a
parallel branch while this programme was in flight, so it shifted rather than renumbering a phase
already on `develop`. The same thing happened to this session's constitution amendment, which was
drafted against 3.4.0 and restacked onto 3.5.0 — parallel branches cannot see each other's
reservations, and the number is settled at merge.

**One amendment, not three.** The second actor is a single decision, and splitting it across three
amendments would let it drift. **Ratified as v4.0.0 on 2026-08-11** — MAJOR, on three independent
triggers: Principle III's actor clause is redefined, the prohibition that Principle III and D2 each
named an amendment as the precondition for is lifted, and delivered requirements are retracted
(FR-132, FR-134, FR-191, FR-311, and FR-548 for the administrative product only). That last is the
reasoning that made v3.0.0 major for withdrawing 001's FR-066, and this is the **second** such
retraction.

**The shape**: administration is **its own website** against the same API and database, so MyNet
itself gains no admin surface and Principle III's *product* framing survives nearly intact. Two
tiers — seeded **platform operators** (product-wide; the only tier that may promote or read
reports) and promoted **conference organizers** (limited to assigned conferences). No self sign-up
into either. The **seed stays** as the dev and test fixture, and seeded conferences become ordinary
editable ones — one class of conference.

**Moderation ships first, not authoring**, though authoring is what the owner asked about. It is the
smallest of the three subsystems, so it proves the whole new architecture where being wrong costs
least — and it closes **register entries 19 and 21**, which have stayed open *specifically* because
no administrative actor exists. Reports are already arriving from 007 and 009 with nowhere to go:
the reporting dialog tells the attendee a person will read it, and that sentence is not yet true.

Migrations run to `0008_session_qa.sql`; **011 reserves `0009`**. The roadmap's reserved-number table
stops at the shipped programme and must be extended.

**002 carries the most leverage and the most risk in the queue, and #02 enlarged it further.** It is
not only the event switcher: it commits to the Home card composition contract and the per-event
scoping predicate that every later phase builds against, performs the interface, route, and seed
splits that make the remaining parallel pairs possible, and — after #02 — carries the whole session
catalog as well. A mistake there is inherited everywhere and has no cheap correction.

Numbers are **not** reassigned: 004–010 keep theirs, and 003 stays in the table struck through so
that the roadmap and this index can still be read against each other. The first free parallel pair is
now 005 ∥ 006 rather than 003 ∥ 004.

**005 departs from the roadmap in two recorded ways** (#03), and its specification must say so.
Its Home contribution is **its own card** rather than the roadmap's "Up-next prefers saved
sessions", because that phrasing means editing 002's `UpNext` and standing decision 9 forbids a
feature editing another feature's card. And it carries a **per-conference cache** the roadmap did
not scope into this phase, which is what closes two idea-inbox entries at once.

**006 departs from the roadmap far more than 005 did**, and its specification says so. The roadmap
scopes it as a directory; as delivered it also carries **the whole deployment platform** — two Azure
VMs, Caddy with automatic TLS in front of an API container and a loopback-only PostgreSQL container,
replacing Fly, Cloudflare Pages and Neon. That half is what constitution **v3.0.0** ratifies, and it
is the first time this project has **retracted a delivered requirement**: 001's FR-066 and SC-011
promised a reviewer a preview of that exact change, and there is no longer one.

The reason the two halves shipped together is that **the configuration they replace could not sign
anyone in**. `fly.dev` and `pages.dev` are separate registrable domains on the Public Suffix List,
so the `SameSite=Lax` session cookie was never sent — a directory nobody can reach is not a
directory. One origin is the fix, and it is a deployment change rather than a feature one.

006 also discharged debt that would otherwise have compounded: **seventeen unchecked repository
casts** removed before its own repository work (FR-497 required that order, and the count was
fifteen in the idea inbox), and the two index findings 004's review deliberately left for whichever
feature owned the next migration number.

**007 departs from the roadmap in one large way, decided by the owner in #06.** The roadmap scopes
it as conversations, thread, compose, unread and the Discover wiring. As brainstormed it also
carries **the whole Web Push notification-delivery platform** — a service-worker push handler, a
per-device subscription store, VAPID key custody, a provider integration, a permission surface and
delivery-failure handling. That reverses the engagement-notification exclusion that has held since
001 and wires `NotificationService` to real delivery for the first time, so it needs its own
numbered standing decision and a constitution version bump before the specification is written.
Delivering it as one feature and one PR was chosen over the recommended split; 004 shipped as a
single 131-task PR and this is larger, so `speckit-spex-collab-phase-split` after planning is the
mitigation rather than a scope change.

007 also ships **block and report**, which the roadmap does not scope at all. They are not
enhancements: open send plus indefinite reachability creates a contact path no attendee can close,
in a product with public self sign-up and no moderator by construction. Reporting resolves to an
**operator** mailbox rather than an in-product actor, which is what keeps it clear of the organizer
exclusion — no admin interface, no privileged role, no reader inside the app.

**008 was blocked by two register entries and #07 closed them with one decision.** A contact is
**someone whose card you hold** — so sharing a digital business card becomes the only
relationship-forming act in the product, and entries 7 and 8 stop being independent questions.
Sharing is **one-directional** (it gives them yours; you get theirs when they share back), a held
card is a **live pointer rather than a copy**, and a shared card is **standing consent that outlives
both the event and the discoverability toggle**. Appointments are **proposed, then accepted or
declined**, and their slots come from an event grid minus *the reader's own* conflicts.

Two of those deserve to be read as departures rather than details. The acceptance step **breaks
consistency with two prior refusals** — 007 for conversations, and #07 itself for cards — on the
ground that reserving another person's time is a different act from messaging them; the asymmetry is
deliberate and is recorded so it does not read as drift. And the roadmap's own suggestion for slot
availability, *derived from both parties' saved sessions*, was **rejected on Principle VIII
grounds**: a saved session is private state, so greying out the invitee's committed slots discloses
their whole Agenda by omission. That eliminated it before it reached the client.

What makes the model worth the trouble: Discover is per-event **and deliberately uncached**, so
until now nothing durable survived the conference at all — and standing decision 7's own rationale
promises that a contact made at last year's conference does not vanish. Network is the durable half
of a product whose discovery surface is transient by design, and #07 is what makes that promise
true.

**#08 splits the roadmap's 010 in two, and the reason is that its two halves have different
blockers.** The roadmap scoped 010 as a validation pass. The owner's steer was UAT only, working
like a charm — a different deliverable — and the two decisions that had gated every deploy since 006
were taken in the same session, so the deployment half became fully unblocked while the validation
half stayed dependent on register entries 2 and 4, neither of which is decidable now and both of
which need people outside this repository. Keeping them as one phase would have held a working UAT
hostage to a brand mark. **010 is therefore deployment and hardening, 011 is validation and
production**, and 010's spec must say it departs from the roadmap.

Two things about 010 are worth reading as departures rather than details. **It absorbs eight idea-inbox
entries, not zero** — six security-and-abuse findings that all get worse the moment a URL is public,
plus two the deployment work unavoidably touches (`backups-share-a-failure-domain`, because the
restore drill would otherwise prove restore works from artifacts that die with the database, and
`vapid-config-duplication`, because its own entry says to settle it when the real adapter lands).
And **reading the inbox against shipped code found seven entries already closed** by work that never
named them — a reminder that the inbox ages, and that an entry can be resolved by a feature that
does not cite it, exactly as register entry 7 was.

## Open Threads

### Opened 2026-08-12 by #10 and #11 — the client feedback round

These are new and none of them existed four days ago. Listed first because two of them reverse
decisions ratified inside the last 72 hours, and a reader who meets those reversals in a spec
without meeting them here will read them as drift.

- **Mutual card exchange reverses v3.2.0 N2** (decision 25), ratified 2026-08-10. Decided by the
  owner on 2026-08-12; the amendment is 016's. **The metaphor is not the argument** — the
  defensible ground is that a card exposes only what its owner already published to co-attendees,
  which the client states independently at REQ-046, and that 007's block already severs cards both
  ways. Two consequences must reach the spec: the exchange writes two rows in one transaction or
  none, and whether the *recipient's* discoverability gates a first acquisition is genuinely
  undecided.
- **The client's Q&A model replaces 009's in full**, reversing v3.3.0 (decision 27) **48 hours
  after ratification**. Correct rather than embarrassing: v3.3.0 recorded a deliberate exception
  after explicitly refusing to derive it, which is what made it cheap to find and revisit. But
  **first-name-versus-full-name is not settled** — the client's own OPEN-002 says so, and the
  transcript contains both positions. 017's spec must confirm with her rather than pick.
- **`assets/brand/new-logo.png` is a different mark, not a new size.** A gradient disc with a
  wordmark, 114×133 RGBA, against the board's 1254×1254 coral-N-on-navy. The owner's decision is
  **icon only, not a rebrand**. Three costs are recorded in #10: a ~4× upscale that
  `brand-audit.mjs` currently fails the build on and which needs a *measured recorded exception*
  rather than a weakened check; a maskable plate colour that cannot be derived the way the board's
  was, because this source has alpha; and a home-screen icon that visibly differs from the in-app
  coral mark, **knowingly accepted** — recorded so nobody later "fixes" it.
- **The admin-counterpart rule is new governance**, set by the owner in this round: anything
  requested in the App must be checked for whether its administrative counterpart exists or must be
  built. Ratified with 016. It paid for itself immediately — "add a confirm-password field" is five
  screens across two products, and the naive reading was one.
- **Notification triggers 2 and 3 are in the transcript** (REQ-095, REQ-112) and the source-level
  audit that blocks them exists for exactly this moment. Each needs an amendment, and REQ-112 needs
  a **job runner this product has never had**.
- **014 is now blocked on an external input.** REQ-033 and REQ-036 have the client supplying the
  interest list and the depurated subsector lists; neither exists. Mitigated by specifying the
  taxonomy as authored or seeded data so the schema does not wait on the content.
- **Networking outside events is blocked on the client's lawyers**, by her own note (REQ-049). It
  contradicts decision 7's per-event Discover, and what is actually being asked for is a *discovery*
  surface outside an event — relationships already persist.
- **Layout was caught by a person for the second time.** The mobile composer grows without a bound
  until its send button is unreachable. Same class as 008's top-left dialog: the control exists, is
  labelled, is focusable and submits, so every behavioural gate passes it. This is now a pattern
  with two data points rather than an anecdote, and it strengthens register entry 4.

### Client decisions

Each names the phase it blocks — when to ask matters as much as what to ask.

**None of these blocks a feature any more.** Constitution **v3.2.0** closed the last three on
2026-08-10, so 008 and 009 — a free parallel pair — are both buildable. What remains blocks
deployment or release.

- ~~**The connection model behind Network contacts**~~ — **RATIFIED in v3.2.0** as owner decision
  N1. A contact is someone whose card you hold. #06 had already narrowed it by making the
  prototype's answer unavailable — under open send a conversation is unilateral, so deriving
  contacts from conversations would let a stranger insert themselves into another attendee's
  Network. *Register entry 7, closed.*
- ~~**What a digital-card exchange records, and whether it is mutual.**~~ **RATIFIED in v3.2.0** as
  N2. One-directional: sharing gives them your card, and you hold theirs only when they share back.
  The row records the exchange, not a copy of the person, and resolution runs under a standing
  consent that outlives the event and the discoverability toggle. *Register entry 8, closed.*
- ~~**Does the card-only contact line breach standing decision 16?**~~ — **ANSWERED 2026-08-10:
  yes.** The owner rejected the reading #07 proceeded under, and the field was withdrawn from 008's
  specification before any migration was written. Decision 16 is **sharpened** rather than changed:
  there is one visibility decision per attendee, and no feature may give an individual field its own
  audience, however that audience is reached. Recorded because the next feature will meet the same
  temptation — and because the specification did the right thing by refusing to settle it silently.
- ~~**Audience-question attribution**~~ — **RATIFIED in v3.2.0** as N3: **attributed**. Q&A is
  therefore a personal-data surface under Principle VIII, with identity scoping, deletion cascade
  and export coverage. *Register entry 9, closed — 009 is unblocked.* **Not solved, and 009 must
  decide it**: what happens to a departing attendee's question that other people have upvoted.
  007's answer for conversations does not transfer, because the votes belong to people who never
  asked to lose anything.
- **Desktop and tablet layouts have never been validated by the client**; the approved prototype is
  mobile-only at a fixed 390×844. Every desktop layout built before this is answered is unreviewed
  design, so the cost compounds per phase. **Now more urgent than when it was written**: absorbing
  the catalog means 002 builds the Home dashboard *and* the catalog screens before any desktop review
  happens, and the roadmap's gate — scheduled for "after 002–003" — now fires after 002 alone.
  *Worth pulling forward* (from #01, escalated by #02). **Escalated again by #08**: 010 puts a brand
  mark on the rail, the top bar and five auth screens across all three width bands, and a mark's
  position and size is precisely the class of thing no behavioural gate can see — the same class as
  the dialog that shipped in the top-left corner having passed 135 e2e tests and five review agents.
- ~~**Real brand mark and application icons**~~ — **ANSWERED 2026-08-10 by #08.** The owner supplied
  a brand board, now tracked at `assets/brand/logo.png`: the MyNet mark (a round-capped "N" with
  two node terminals) on
  navy and cream, horizontal and stacked lockups, scale tests to 16px, and a monochrome test. This
  is the client decision the entry was waiting for, so 010 is no longer blocked on an asset that
  does not exist. **RATIFIED 2026-08-10 as constitution v3.4.0** — standing decision 27, and the
  rule now lives in a binding block, "Brand identity and application icons", rather than in a
  struck-through entry. The board was moved to `assets/brand/` by owner decision, and 010 carried
  the move out: in this repository "seed" means database seed data, and a brand board filed beside
  it reads as conference fixture data. Two things it deliberately did **not** settle: whether the UI palette adopts the brand's
  navy and coral — now **register entry 23** — and the vector redraw the raster crop defers, which
  010 books rather than notes.

  **Cheapened, not closed, by 011.** Entry 4 now blocks **012**, and once UAT exists the client
  reviews the running product at their own screen width instead of a description — which is the
  only way this entry has ever been answerable. It is the last register entry standing between the
  product and a release.
- **`GroundZero/requirements.md` is knowingly out of step** with the constitution on product name,
  delivery mode, persistence, authentication, and routing. Amend it, or record the divergence?
  (from #01)
- **What "PS" denotes** in the repository name `mynet-ps`. The GitHub organisation is
  `Programa-Semilla`, which is a strong fit — but Principle I forbids closing a register entry by
  inference, so this stays open until confirmed (from #01)

### Owner and planning decisions

- ~~**API hosting and the managed PostgreSQL provider**~~ — **RESOLVED in v3.0.0** by D12 (two
  Azure VMs), and **#08 supplies the subscription it lacked**:
  `d428f98f-a3c4-49c3-ae24-06ec3de08477` (LinaSys-DevEnv), `centralus`, both environments. The same
  subscription `bds-ps` uses, which also makes that project a working reference for this deployment
  rather than merely a sibling
- **Authentication ownership** — self-implemented or a delegated provider (from #01 revisit).
  *Register entry 12.* Worth noting that it is self-implemented and shipped; what stays open is
  whether that is the settled answer or an unratified default
- ~~**The transactional email provider.**~~ — **ANSWERED 2026-08-10 by #08: Mailgun.** *Register
  entry 18.* Its DNS verification lands on `programasemilla.com`, the same session as the UAT A
  record. **Non-optional for UAT rather than merely desirable**: verification gates discoverability,
  so with only the sink adapter every UAT attendee is invisible to every other one. `MailService`
  is already a port with a `SinkMailService`, so the real adapter follows 007's `PushService` shape
  exactly — including selection by configuration in every environment identically
- ~~**The Web Push provider, and VAPID key custody.**~~ — **ANSWERED IN PART 2026-08-10 by #08.**
  *Register entry 20.* The provider half was already found not to exist. **Custody is settled**: one
  pair per environment, generated once, a GitHub Actions environment secret injected into the VM's
  `.env` by `deploy.sh`, identical to every other secret — and **rotation only on compromise**,
  because rotating silently stops delivery for every attendee until their browser re-registers. The
  entry's "push provider" wording should be corrected in the same amendment
- ~~**The operator address a report is emailed to.**~~ — **ANSWERED 2026-08-10 by #08:
  `apps@programasemilla.com`.** *Register entry 21.* The response expectation travels with it and is
  not discharged by naming an address: the dialog tells the attendee a person will read it, and that
  sentence becomes true only when somebody does. **#09 changes what this entry is.** 012 makes
  reports readable *inside* the product by a platform operator, so the question stops being "which
  mailbox" and becomes "who is the operator, and what does the queue disclose". The mail path does
  not disappear — but the promise the dialog makes becomes true by a surface rather than by an
  address. *Register entry 21, addressed by 012.*
- **The constitution amendment bringing engagement notification delivery in.** #06's push decision
  reverses an exclusion that has held since 001 and needs its own numbered standing decision and a
  version bump. Decision 20 made the last retraction a major version; this is at minimum a minor
  one. *Should land before 007's specification* (added 2026-08-07 by #06)
- **The object storage provider** for avatar images. #04 put a `StorageService` interface in front of
  it with a local implementation for development, test and preview, so 004 is testable without it —
  but the production path stays unproven until this is answered. **Folds into API hosting above**
  rather than standing alone (added 2026-08-07 by #04)
- **Nobody moderates uploaded avatar images.** Public sign-up plus image upload, with no admin actor
  and no moderation surface, and the organizer exclusion is what forecloses the usual answer.
  Cheapest to settle before the first public preview (added 2026-08-07 by #04). **#06 supplies a
  precedent rather than an answer**: it resolved the same shape for messages by routing reports to
  an *operator* mailbox out-of-band, on the reading that the constitution forecloses organizer
  administration *inside the product* but not an operator. If that reading holds, avatars can follow
  the same route (narrowed 2026-08-07 by #06). **#08 changed its urgency without resolving it**:
  UAT is now openly reachable with public sign-up, so this stops being hypothetical — and the
  operator mailbox the precedent needs now has an address. **#09 then supplied the actor rather
  than another precedent**: 012 introduces an administrative tier and a moderation surface, which is
  the first thing in this project capable of discharging this entry — though a capability is not a
  policy, and who moderates against what standard is still undecided. *Register entry 19, still
  open, and the leading open question against the administrative programme*
- ~~**Preview environments must never point at production data**; preview access control
  undecided~~ — **the access half ANSWERED 2026-08-10 by #08**. *Register entry 14.* UAT is
  **openly reachable and carries seeded data only**: FR-067 is satisfied by the data rather than by
  the access control, and no real attendee data ever reaches it. Basic auth and an IP allowlist were
  both rejected for the same reason — each breaks the two things 011 depends on, handing the client
  a link for the entry-4 layout review and installing the PWA on a physical iPhone over cellular.
  The data half was already binding and is unchanged
- **Two domains, and only one of them is settled.** UAT is `mynet-dev.programasemilla.com`, on a
  domain already under the owner's control. Production is **`mynetcr.com` provisionally** — not
  registered, not final, documented rather than committed to `prod.env`. Worth recording as a free
  win rather than a coincidence: they are separate registrable domains, so a UAT session cookie is
  *structurally incapable* of reaching production, which is the strongest available form of the
  isolation FR-067 demands (added 2026-08-10 by #08)
- **Repository visibility.** The repository is **public** and owned by the `Programa-Semilla`
  organisation. Nothing in the constitution or `CLAUDE.md` records this, and both were written
  assuming private. Intended, or an artifact of creation on 2026-08-05? It changes the Principle VIII
  threat model either way (added 2026-08-06)
- **The CI pipeline is not running.** Runs queued since 2026-08-06 17:04 have never started, and
  **nothing currently on `develop` has ever passed CI** — PR #2 merged with all seven checks in
  `QUEUED`. Not minutes exhaustion; public repositories get unlimited Actions minutes
  (added 2026-08-06)
- **Server-side branch protection is unconfigured, not unavailable.** The earlier entry recorded
  "private repo on a free personal account, APIs return 403". Both halves were wrong: the repository
  is public, and `branches/develop/protection` returns **404 — no rule set**. Branch protection is
  free on public repositories, so this is a configuration task rather than an accepted risk
  (corrected 2026-08-06)

### Design questions carried into 014's specification

From #10. The decision itself is made; **the amendment it needs, v5.2.0, is not yet drafted and
gates the first line of code.** These are for `/speckit-specify`, except where they are governance
and must be escalated. **None may be silently resolved.**

- **Which changes are "material" enough to dispatch?** Cancellation certainly, a start-time change
  certainly, a room change probably; a title, summary or speaker swap probably not. **The amendment
  must name the set**, because the set *is* the scope of the second trigger — leaving it to a
  handler is exactly the drift v3.1.0's one-sentence rule was written to prevent.
- **A saved-session push carries a session title to a lock screen.** v3.1.0 accepted the equivalent
  for message content and explicitly did **not** solve whether an attendee may suppress it. 014
  makes that unsolved question apply to a second content type, which is the second time it has come
  up unanswered. Escalate rather than decide.
- **Is the count that gates delete-vs-cancel a disclosure?** Showing an organizer "12 attendees
  saved this, 4 wrote notes" is an aggregate over attendee state with no identity attached, so
  probably not a Principle VIII exception — but v3.3.0's whole point is that this project records
  such things rather than deriving them.
- **Speakers are personal data about people who are not attendees.** Seeded rows already carry a
  real person's name, title and company; what 014 changes is that they become *organizer-authored*,
  which moves responsibility. `deletion-coverage.test.ts` and `export-coverage.test.ts` derive from
  the schema, and Principle VIII has only ever considered attendees.
- **May an attendee still ask questions on a cancelled session?** Its existing Q&A survives by
  requirement; whether the composer stays open is undecided.
- **Does the event timezone stay editable once sessions exist?** `timestamptz` means no absolute
  instant moves, but every displayed local time shifts — including saved-session rows and Home's
  "Up next". The same decision as the material-change question, approached from the other end.
- **May a conference be deleted, and by whom?** The cancel-not-delete rule answers this for sessions
  and says nothing one level up, where registrations make it worse.
- **Nothing bounds how many conferences a promoted attendee may create.** Bounded by trust, since
  promotion is platform-tier only. Worth a deliberate decision rather than an accident.
- **Register entry 22 gets staler in a new way.** A cached conference can already outlive a
  withdrawn registration by 24 hours; 014 makes an *edited* programme sit in the same cache. The
  entry is filed against 012, 013 did not answer it, and 014 is the first feature to make the cached
  copy wrong for a reason other than access.
- **The roadmap's reserved-number table stops at the attendee programme**, and has now been wrong
  for two features running. Housekeeping, not a decision — but it is the third collision, and 013
  took `0009` while 012 holds `0010`, which is why 014 reserves `0011`.

### Design questions carried into 011's specification

From #09. The decision itself is made and ratified as v4.0.0. **Three of these turned out to be
governance rather than spec detail, became register entries 24, 25 and 26, and were closed the same
day by v4.1.0** — the subdomain topology with host-only sessions, the report queue disclosing
reported content and the reporter's reason as a **third** Principle VIII exception, and organizer
assignments ending with access. They are marked below and are now binding text. The rest are for
`/speckit-specify`. **None may be silently resolved.**

- **[ENTRY 25 — CLOSED by v4.1.0] A promoted organizer can delete their own account.** Standing
  decision 12 makes deletion
  self-serve, complete and cascading with no tombstone. If the only organizer of a conference
  exercises that right, the conference is orphaned by a guaranteed action — and the sessions they
  authored are conference content, so they survive, ownerless. Neither the deletion guarantee nor
  the ownership model can simply win. **Owner decision.**
- **Does withdrawing from a conference revoke an organizer assignment for it?** 008 established that
  withdrawal cancels live meetings in the same transaction; the analogous question is unanswered.
- **[ENTRY 26 — CLOSED by v4.1.0] The admin site needs its own session topology.** Standing
  decision 19 — one origin for client
  and API — is what keeps `SameSite=Lax` a genuine CSRF defence and `connect-src 'self'` literally
  true. A second site is a second origin and cannot inherit that reasoning unexamined. **This is the
  exact trap v3.0.0 was written to escape**, where the previous configuration could not sign anyone
  in. It also meets two long-parked inbox entries head-on — `session-topology-and-csrf` and
  `security-response-headers` — which have been filed since 001 as "cheapest to settle before the
  first environment is opened".
- **[ENTRY 24 — CLOSED by v4.1.0] What does the report queue disclose?** The operator mail
  deliberately carries identifiers and a
  timestamp, never message text and never the reason (decision 23). If reports become readable in a
  product surface, does that surface show the reported content? Message content is the most
  sensitive data in the product, and Principle VIII requires an exception to be *recorded* rather
  than derived — as v3.3.0 required for Q&A visibility. **Likely a third recorded exception.**
- **What may a moderator actually do?** Removing a question, suspending an attendee and replacing an
  avatar are three powers with three different reversibility stories. 009 settled that a *withdrawn*
  question takes everybody's votes with it; a *moderator-removed* one is not obviously the same case.
- **Does an organizer appear in Discover, and can they be blocked?** They are an attendee, so by
  default yes. Blocking a moderator is a coherent attendee action with incoherent consequences.
- **What does editing a live conference do to attendees who saved the affected sessions?** Moving or
  deleting a session sitting in somebody's Agenda, or on Home's "Up next" card, has no defined
  behaviour today. This is **012's central problem** and is worth naming now.
- **Is "organizer" the right word?** It is the exact term Principle III uses for the excluded actor.
  Reusing it makes the amendment's diff read clearly and makes every older comment ambiguous.
- **Deletion and export coverage for the new tables.** Both coverage tests derive expectations from
  the Drizzle schema, so **a new table or column fails by existing**. Operator records are personal
  data about somebody who is not necessarily an attendee — a case Principle VIII has never had to
  consider.
- **Is the admin site installable?** MyNet is a PWA with a manifest, icons and a service worker. The
  admin site probably should not be, and that belongs in the spec as a stated absence.

### Design questions carried into 010's specification

From #08. None blocks the specification. The brand decision itself is answered above.

- **Whether `navy-800` and `coral-500` adopt the brand's values.** Measured from the board, they
  disagree with the tokens: brand navy `#0d1942` against `navy-800 #1b2340`, brand coral `#fe6551`
  against `coral-500 #e8634d`. Cream matches. **Deliberately deferred** — navy-800 is the primary
  surface and coral-500 the accent, so adopting them repaints the whole product and the
  accessibility suite must re-pass on new contrast ratios. The interim cost is knowingly accepted: a
  visible seam between the icon plate and the token-derived `theme_color` on the splash screen.
- ~~**The brand source is filed beside database seed data, and the collision is not cosmetic.**~~
  **SETTLED by 010**: the board is tracked at `assets/brand/logo.png`, and the directory it arrived
  in is gone. In this repository "seed" means database seed data (`pnpm db:seed`), so the path was
  settled before any build script referenced it.
- **Whether the mobile top bar carries the mark at all.** It is contextual by design — product name
  at mobile widths, current destination above them — so a mark competes for the same small strip.
- **The iOS splash device matrix**, which is the bulk of the extras bundle's cost and the whole of
  its precache risk: `injectManifest` globs `**/*.png`, so every splash image is precached at
  install unless deliberately excluded. Several megabytes, on a phone at a venue.
- **Whether the asset budget (FR-072) counts `public/` assets.** It reads the entry chunk and its
  static imports, so these probably fall outside it — meaning the extras bundle could add megabytes
  to the install with **no gate objecting**. Confirm rather than assume.
- **Whether `purpose: "monochrome"` is worth shipping.** Platform support is thin; the board's
  monochrome test is suggestive, not decisive.
- **Nothing asserts the manifest's declared icons exist on disk.** A manifest naming a missing file
  passes every one of the ten correctness gates and fails only when a real device tries to install.
  010 should close this in the spirit of `deletion-coverage` and `export-coverage` — derive the
  expectation from the declaration, so a newly declared icon with no file **fails by existing**.
- **The vector redraw is a follow-up that must be booked, not noted** — but **not for the reason #08
  gave.** The session reasoned that the two 512px assets are a 1.37× upscale of the 283×300px mark
  and are therefore degraded. **010's planning corrected this** (research R1): the maskable safe
  zone is a *circle* of 80% diameter, not 80% of the side, so the largest mark that fits a 512px
  maskable icon is **297.9px — 0.993× of native**, and nothing the feature ships is upscaled at all.
  Worse, sizing the mark to 80% of the *side* as #08 assumed would put the node terminals **outside**
  the safe zone, to be clipped by any circular mask. The redraw stays booked for resolution
  independence at sizes not yet asked for; it is not rescuing a soft asset.

### Design questions carried into 008's specification

From #07. None blocks the specification. The one item that could — whether the card contact line
breaches standing decision 16 — is a client decision and is listed above.

- **Whether card resolution needs its own branded scope and a fourth route audit.** Cards are
  cross-event, so `EventScope` cannot reach them and the event-scope audit would **silently pass** a
  route naming no conference — the exact hole 007 found and closed with `ConversationScope`,
  `requireParticipation` and a second audit. Appointments are per-event and may compose `EventScope`
  with a participant check instead. Decide deliberately: the failure mode is silence.
- **Whether Network caches anything offline** — see the narrowed 007 entry below; #07 leans
  appointments yes, contacts no.
- **What the slot grid is as seed data** — slot length, how many per day, whether it varies by
  event. Conference content under standing decision 8, so seeded and versioned rather than
  configured.
- **Whether a proposal expires.** A proposal for a slot that has already passed is not an
  appointment and should not sit in a list forever.
- **How many pending proposals one attendee may send another.** Proposing is unilateral and cheap;
  unbounded, it is a contact path that blocking closes only after the fact. 007's per-action
  throttle is the existing mechanism.
- **Whether an appointment survives the proposer withdrawing from the conference**, and what a held
  card shows when the sharer has left every event you share. Neither is deletion — the account still
  exists.
- **Copy for a contact whose card resolves to nothing** because the sharer deleted their account.
  The state is decided by cascade; the words are not, exactly as with 007's departed counterpart.
- **Whether the contacts list needs pagination.** 006 needed a keyset cursor for a thousand
  attendees; a held-card list is bounded by deliberate human acts. State it either way rather than
  discovering it.
- **Whether 008 splits into reviewable phases.** Two subsystems sharing only a destination. Decide
  after planning against the concrete task list, as 007 did.

### Design questions carried into 007's specification

From #06. None blocks the specification; all are for `/speckit-specify` and its review gate. The
three items that *do* block it are owner decisions and are listed above.

- **The polling interval, and its backoff when the tab is hidden.** #06 chose two independent
  freshness paths, so the non-push one needs a number the spec can justify — on a phone at a venue,
  where it is battery and request load.
- **A maximum message length.**
- **Whether an attendee may suppress message content in notifications.** #06 chose content-carrying
  push payloads over the recommended signal-only form, accepting that the most sensitive content in
  the product appears on lock screens. A per-attendee preference is the usual mitigation and was not
  decided either way.
- **Copy for the departed-counterpart half-thread** — what the remaining attendee is actually told
  about a conversation whose other side has erased themselves. The state is decided; the words are
  not.
- **Whether a report record survives either attendee deleting their account.** Cascade destroys the
  evidence of the report; retention keeps one attendee's data past their erasure request. Neither is
  obviously right, and `deletion-coverage` will not accept silence.
- **Whether the offline cache key gains an event-less variant.** The decorator is keyed
  `(attendeeId, eventId, resource)` and threads are not event-scoped. #06's refusal to cache makes
  this moot for 007, but **008's cross-event contacts meet it again** with no such escape.
  **#07 carries a leaning rather than an answer**: appointments are cacheable — the attendee's own
  commitments, per-event, and the existing key fits them exactly as it fits saved sessions — while
  contacts are not, because resolving a held card reads *other people's live profile data*, which is
  the argument that made Discover uncached. If that holds, the question is answered by refusal and
  the key never needs an event-less variant (narrowed 2026-08-10 by #07).
- **Whether 007 splits into reviewable phases.** 004's expectation that it would need to was wrong;
  this feature is larger and carries two subsystems. Worth deciding after planning rather than
  before.
- **The conversation switcher must not scroll horizontally.** The prototype's horizontally-scrolling
  avatar strip (`App.tsx:971`) contradicts the binding constraint that no primary action require
  horizontal scrolling, and switching conversations is a primary action. Recorded as a prototype
  defect to correct, in the same category as its missing Escape handling and focus states — not an
  open question.

### Design questions carried into 005's specification — settled

From #03, and now answered by the delivered feature.

- **How long a cached programme may be shown before it is refused rather than stamped** →
  **settled: 24 hours from retrieval** (FR-221). #03 decided the staleness *stamp* and left the
  upper bound open; the specification review escalated that absence from a governance gap to an
  **authorization hole**, because offline there is no server present to refuse and the age limit is
  the only thing that revokes access after a registration is withdrawn. Beyond it, content is
  refused with the same wording as a conference never read rather than shown with an old stamp.
  *Whether 24 hours is the right span stays open below; that there is a value does not.*
- **Whether a saved session is removable from the detail panel as well as from its row** →
  **settled: from the row only.** One save affordance per session. Recorded as an open presentation
  question below, to be answered against the built screen rather than in advance.

### Design questions still open after 005 — for observation, not for a gate

- **Whether 24 hours is the right cache lifetime.** A value is set and enforced; whether a
  conference day plus an overnight is the right span — against a multi-day conference with poor
  signal throughout, or against a shorter window for tighter revocation — is a product judgement
  worth revisiting once the feature is in use.
- **Whether the two next-session cards on Home need any relationship.** 005's card and 002's
  `UpNext` can legitimately disagree — the attendee's saved 11:00 talk against the programme's
  id-first 11:00 talk. Decision 9 says they are independent; whether that reads as *composed* or as
  *contradictory* on the first viewport is worth looking at now that both are on screen.
- **Whether a session should be unsavable from the detail panel as well as from its row.** Two
  affordances for one session may read as redundant or as convenient.
- **The arbitrary tie-break in `nextSession()` survives** on the generic Up next card. The seed
  already contains two sessions starting at 11:00, so the first viewport is already featuring one
  for reasons the attendee cannot see. 005 works around it rather than fixing it; the recorded
  alternative is preference through `contract.ts` (#03 approach B).

### Design questions carried into 004's specification

From #04. None blocks the specification; all are for `/speckit-specify` and its review gate.

- **Which jurisdiction's data-protection regime applies.** #04 deliberately built to the strict
  standard so this does not gate 004, but the retention *window* and any lawful-basis wording depend
  on it.
- **How long sign-in attempts are retained** before the purge clears them. `sign_in_attempts` has no
  foreign key to `attendees`, by design, so it is the one personal-data table a deletion cascade
  cannot reach and a clock is the only thing that can.
- **Sign-up is an unauthenticated write endpoint**, and the existing throttle covers sign-in only.
- **The event join code would be world-readable.** The repository is public and the code would live
  in committed seed data, so anyone reading the repository could join any conference. Move it out of
  the seed, generate it at deploy time, or accept it as non-secret.
- **Whether deleting an account frees its email address for re-registration.** Hard deletion plus a
  globally unique email means it does, which is probably right and is currently unstated.
- ~~**Hard deletion gets harder in 007 and 009.**~~ **Settled for 007 by #06; still open for 009.**
  A departing attendee's messages and participant row cascade away; the other participant keeps
  their own words in a surviving one-sided, read-only conversation. The two rejected alternatives
  are recorded: deleting the whole thread destroys data belonging to someone who never asked, and
  severing authorship retains free-form self-identifying text after an erasure request. **009's half
  is untouched** — an audience question sits on a session other people upvoted, and the same three
  options do not resolve the same way there.
- **Whether `CameraService` is wired for direct capture**, or upload is file-picker only.
- ~~**How 004 splits into reviewable phases.**~~ **Settled by delivery: it did not split.** 004
  shipped as one PR of 131 tasks ([#12](https://github.com/Programa-Semilla/mynet-ps/pull/12)),
  and the reserved migration `0003` *was* sufficient — the expectation that it would not be was
  wrong. Worth remembering when sizing 006: the pessimism here was about task count, and task count
  turned out not to be what made a split necessary or unnecessary.

### Design questions carried into 002's specification — all settled

Not client or owner decisions — these were for `/speckit-specify` and its review gate to settle.
All from #02, and all now answered by the delivered feature.

- ~~**Which 002 card exercises the attendee-scoped path?**~~ **`YourConferences`** (T075), which is
  the registered-conferences view Home already carried rather than a card invented for the purpose.
  It is a real card on the real dashboard, so the half of the contract the session kept flagging is
  proven by use rather than by a test double.
- ~~**The clock story**~~ — **two clocks, deliberately, each for the thing it is actually about.**
  The day number follows the **venue's** zone, because it is a fact about the conference; the
  time-of-day greeting follows the **device's**, because it is about the reader. Session times are
  stored as absolute instants and all relative wording is computed at display time.
- ~~**Do sessions carry their own timezone or inherit the event's?**~~ **Inherit.** The timezone is
  a property of where the conference is held, not of each item on its programme. The limit is
  recorded: a satellite session in another city would break it, and none is in scope.
- ~~**One migration or two**~~ — **two.** `0001_event_context.sql` and `0002_session_catalog.sql`,
  which keeps the event-context change reviewable apart from the catalog and honours the
  reservation rather than silently retiring a number.
- ~~**What happens when two cards claim the `lead` slot**~~ — **a unit test plus a development-mode
  assertion**, not compile-time impossibility. Recorded rather than glossed: a type-level guarantee
  would need a tuple or a narrowing builder, either of which makes the registry hostile to the
  one-line append it exists for (research D8).
- ~~**Offline reading of catalog content**~~ — **nothing is cached, and that is declared rather
  than defaulted.** Every conference-scoped surface says it needs a connection, distinguished from
  a server fault. The staleness policy remains genuinely open (see Open questions below); 002 makes
  the question concrete without answering it.
- ~~**Whether the enlarged 002 still wants one pull request**~~ — **yes, reaffirmed a third time**
  at the phase-split hook against the concrete 89-task list, alongside a two-PR split at the US1
  seam and a three-PR split isolating the shared-file split. Recorded with it: because `develop` is
  squash-merge only, Phase 1's separate commit does not survive the merge, so its review-isolation
  purpose is met at the commit level but not at the review level.

## Resolved

**2026-08-04, ratified in constitution v2.0.0**

- **Product name** — MyNet.
- **Demo scope versus persistence** — MyNet is the real product with durable server-side state.
- **Routing model** — five individually addressable destinations, overriding the "single-route"
  wording in `requirements.md`.
- **Backend architecture** — project-owned API over managed PostgreSQL, chosen over a managed BaaS
  and over serverless functions.
- **Authentication timing** — foundational, not deferred to a later slice.

**2026-08-06, ratified in constitution v2.1.0**

- **Event scoping** — hybrid. Conference content is per-event; relationships persist across events.
- **Content provenance** — conference content is seeded; each attendee authors their own profile.
  No administrative interface and no content import path.
- **Home composition** — a slot-based card registry built early, not a dashboard aggregated late.
- **Sequencing** — phases run mostly sequentially, in parallel only where they touch disjoint files.
- ~~**Attendee profile view**~~ — **delivered in 006.** A `<dialog>` at `/discover/:attendeeId`,
  built on 004's three-condition read unchanged, so it inherits the four-way indistinguishable
  refusal by construction. Original entry: a profile detail view is delivered in 006, closing the gap where
  `requirements.md` says a profile can be opened and the prototype has no such screen.
- **Repository shape** — the API lives in this repository, at `apps/api` inside the pnpm workspace.

**2026-08-07, by brainstorm #04 — awaiting ratification in a constitution amendment**

The project owner confirmed he speaks for the client on the two client-owned entries, so these are
binding rather than provisional. They close the last three entries blocking 004.

- **Attendee identity model** — **self sign-up with an event join code**, delivered entirely within
  004. A person creates their own account and registers for a conference with a code carried on the
  seeded event row. No issuer, no privileged role, no import path, so the attendee remains the only
  actor. Three of the register's four candidates — event invitation, organizer-provisioned, ticket
  holder — were never available under Principle III. *Closes entry 5.*
- **Transactional account mail is in scope**, and is distinct from notification delivery, which stays
  excluded. The notification bell remains forbidden.
- **Data retention, deletion and export** — **full self-serve.** Hard deletion with cascade and no
  tombstone, machine-readable export, and a retention clock for the one table a cascade cannot reach.
  Built to the strict standard so that settling jurisdiction is not a precondition. This also gives
  005's `ON DELETE CASCADE` something to trigger it — it has been unreachable since it shipped, as
  no delete-account route exists. *Closes entry 6.*
- **Attendee avatar handling** — **real upload**, with resizing and EXIF stripping mandatory rather
  than optional, since phone photographs carry GPS coordinates. *Closes entry 13.*
- **Image bytes live behind a `StorageService`** platform interface joining the existing six, with a
  local implementation for development, test and preview, so 004 needs no provisioning.
- **Profile visibility** — visible to attendees registered for the same event, enforced by the
  existing `EventScope` predicate, with a single discoverability toggle rather than per-field
  permissions.

**2026-08-10, by brainstorm #07 — awaiting ratification in a constitution amendment**

Closes the last two register entries that blocked a queued phase. Both were client decisions; the
project owner has previously confirmed he speaks for the client on those, so they are binding rather
than provisional — with the single exception noted under Client decisions above.

- **The connection model behind Network contacts** — **a contact is someone whose card you hold.**
  No connect verb and no accept step, because neither appears in `requirements.md` or the prototype.
  *Closes entry 7.*
- **What a card exchange records, and whether it is mutual** — **one-directional, and it records the
  exchange rather than the person.** Sharing gives them your card; you hold theirs when they share
  back. The stored row is sharer, recipient, instant, and the event it happened at, with details
  resolving live from the sharer's current profile. *Closes entry 8.*
- **A shared card is standing consent that outlives the event and the discoverability toggle** —
  discoverability governs being *found*, not being *remembered*. This is the rule that makes a live
  pointer viable instead of a snapshot, and it is a read path that deliberately bypasses 006's
  visibility conditions while **not** re-checking verification, which gates discoverability and
  nothing else.
- **A card cannot be recalled; 007's block severs it** in both directions and prevents scheduling.
  One existing server-enforced control rather than a second half-overlapping verb.
- **Appointments are proposed, then accepted or declined**, and slots come from a seeded event grid
  in venue time minus *the reader's own* conflicts — never the invitee's, which would leak their
  Agenda by omission.
- **No notification is dispatched for a proposal, acceptance, or decline.** The trigger set stays at
  a received message and nothing else, and 008 does not edit the audit that enforces it.

**Settled by delivering 001**

- **Foundation packaging** — it shipped as a single pull request (#2), answering the open thread
  about whether the widened scope needed splitting.
- **Abstraction layer shape** — a root-injected registry, not a context provider per service.
- **Package manager** — pnpm, with a committed lockfile.

## Parked Ideas

**Thirty-four entries** in `brainstorm/idea-inbox.md` — six from the 001 deep review, four from
002's, six from 004's, four from 006's, three from 007's, six from 008's and five from 009's. #09
consumed none: every entry is a deep-review deferral, and none of them seeds administration.
*(Count corrected 2026-08-11 by #09, which found this line still reading "twenty-three" and omitting
008's and 009's review deferrals entirely. Corrected once before, on 2026-08-10 by #07, from "ten".)*

From 001: session topology and CSRF, security response headers, the production deployment path,
readiness versus liveness, throttle clock provenance, and substitutability proven without the
application. From 002: platform-registry structural typing, the seed production guard, the route
audit's inability to see `$ref` schemas, and integration-test isolation coupling. From 004:
verification proves reachability not ownership, platform-registry mirroring cost, the identity
repository spanning two subjects, the join-code lookup that cannot use its index, avatar serving
without a revalidation story, and dialog component tests that cannot see modality. From 006:
directory-listing throttle, backups sharing a failure domain, unbounded directory accumulation, and
the read-path avatar repair. From 007: a session write per request, an unthrottled read path, and
VAPID config duplication.

Three of these are now **more** urgent than when they were filed, because 008 touches what they
describe: `avatar-serving-has-no-revalidation-story` (a contacts list renders avatars the same way
the directory does), `directory-listing-throttle` (card sharing is a second unilateral write against
another attendee), and `platform-registry-mirroring-cost` — though 006 already removed the casts
that entry was counting.

Two of them — **session topology and CSRF** and **security response headers** — are the same
decision seen from two sides, and both are cheapest to settle before the first preview environment is
opened rather than after.

**Consumed and removed by #03**, each closed with a decision rather than deferred again — and all
three now **delivered by 005**:

- `interface-evolution-for-offline-data` → 005 caches the active conference's programme, saved set
  and notes; reads carry a staleness stamp; writes are refused offline rather than queued, so no
  write queue, optimistic update or conflict resolution is incurred.
- `home-card-duplicate-reads` → repeat reads are served from that same cache. Cards still call the
  repository independently and **FR-164 holds unchanged**; identical reads are parsed and sorted
  once rather than once per caller.
- `destination-owns-its-element` → an optional `element` moves onto the `Destination` entry, so the
  router's `path === '/agenda'` special-case becomes an append on Agenda's own line. 005's new
  `/agenda/<sessionId>` route needs this regardless. **Delivered, and slightly larger than
  scoped**: the destination also declares its nested `children`, so `routes.tsx` now names no
  address at all and 006–009 extend `navigation.ts` rather than the router.

The delivery-queue seed for phase 002 was consumed by #02 and removed.
