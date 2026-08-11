# Review Guide: Administrative Foundation — the Second Actor, the Admin Site, and the Report Queue

**Generated**: 2026-08-11 | **Spec**: [spec.md](spec.md)

## Why This Change

MyNet has been promising something it cannot deliver. Since 007 shipped, the reporting dialog has
told attendees that **a person will read their report** — and no such person exists inside or outside
the product. Reports leave as mail to an address nobody has decided on (register entry 21), avatars
uploaded by anyone who signs up are moderated by nobody (register entry 19), and 009 added the
product's first public many-to-many surface while recording in writing that it *"needs a moderator,
and a moderator is an organizer — the actor Principle III excludes by construction."*

Those three obligations all trace to the same prohibition, and it had to be paid for or reversed.
Constitution **v4.0.0** reversed it on 2026-08-11; **v4.1.0** closed the three questions v4.0.0
opened. This feature is what makes the promise true.

## What Changes

A **separate administrative website**, on its own subdomain, against the same API and database.
A **second actor** appears for the first time in this project, in two tiers: seeded **platform
operators** with product-wide authority, and **conference organizers** — attendees promoted by a
platform operator, whose authority reaches only conferences they are assigned.

Platform operators can read the abuse-report queue with the reported content and the reporter's
stated reason, record an outcome, and **remove a reported audience question**. That is the only
enforcement action in this feature.

**MyNet itself changes in no way at all.** No administrative surface, no privileged view, no
rendering that branches on tier — four requirements enforce that as testable absences, and the
attendee test suite must pass unmodified.

**Breaking changes**: five delivered requirements are retracted for the administrative product only —
FR-132, FR-134, FR-191, FR-311 and FR-548. Each survives for MyNet. This is the second time this
project has retracted delivered requirements; the first was v3.0.0.

## How It Works

**A new workspace app, `apps/admin`**, not a second entry point in `apps/web`. This makes the
absences structural rather than configured: there is no manifest to exclude and no service worker to
un-register, because the app that has them is a different app. It also makes "no administrative route
in MyNet" testable by directory.

**A second Caddy site block** for `admin.{$APP_DOMAIN}`, serving the admin client and proxying
`/api/*` to the *same* API container. Each origin serves its own client and its own API, so
`connect-src 'self'` stays literally true on both.

**A fourth branded scope and a fourth route audit.** `OperatorScope` and a `PlatformScope`
refinement, constructible only by their guards, plus `operator-audit.test.ts`. Administrative routes
name no conference, and the existing `event-scope-audit` **reports success** on such routes — so
without this they would be guarded by nothing while the suite stayed green.

**Five new tables** in migration `0009`: `operators`, `operator_sessions`, `organizer_assignments`,
`report_resolutions`, `admin_audit_entries`. An append-only audit records every administrative write
plus every read that discloses message content.

**Eight phases**, 159 tasks. The guards are written **first and failing**, before any route exists.

## When It Applies

**Applies when**:
- An operator needs to read or act on an abuse report filed from a conversation (007) or a question (009)
- A conference needs an organizer assigned, or one removed
- An abusive audience question needs removing from a live event
- A platform operator needs to be bootstrapped into a fresh environment

**Does not apply when**:
- **Authoring conference content** — events, sessions, tracks, rooms, speakers. That is **012**, and the guards forbidding it stay in force
- **Managing registrations or join codes**, or suspending an attendee. That is **013**
- **Moderating an avatar** — register entry 19's *standard* is undecided, and building the action would decide it by inference
- **Removing or editing a message** — reporting already blocked the sender at report time, so the protective act has happened
- **Anything inside MyNet.** The attendee product gains nothing

## Key Decisions

1. **Moderation ships in the foundation feature, not after it.** *Alternative*: authoring first,
   which is what the owner originally asked about. *Why*: moderation is the smallest of the three
   subsystems, so it proves the whole new architecture where being wrong costs least — and reports
   are already arriving with nowhere to go. The first PR makes an existing promise true rather than
   only enabling future work.

2. **A subdomain, not a path and not a separate domain.** *Alternatives*: `mynet.example/admin`, or a
   wholly separate registrable domain. *Why*: `SameSite` is evaluated against the **registrable
   domain, not the origin**, so a subdomain is *same-site* (the CSRF defence survives untouched) and
   *different-origin* (its own service-worker scope, storage and CSP). Neither alternative gives
   both. A path shares the origin, and MyNet's service worker is registered at root scope so it would
   intercept admin navigations. A separate domain stops `SameSite=Lax` being sent at all — precisely
   the v3.0.0 failure where nobody could sign in.

3. **Host-only session cookies, giving two independent sessions.** *Why*: an elevated administrative
   session should not ride along with casual attendee browsing, and signing out of one should not
   sign out of the other.

4. **Two guards, not one guard returning a tier field.** *Why*: `PlatformScope` as a branded
   refinement makes a platform-only handler **fail to typecheck** without it. `if (tier ===
   'platform')` scattered through handlers is a convention every new route can forget — and three
   prior features each had to build a structural guard after discovering exactly that.

5. **Audit entries are pseudonymised on attendee deletion, not cascaded.** *Alternatives*: cascade
   (erasure absolute, accountability lost) or retain in full (accountability complete, erasure not).
   *Why*: the record's subject is **the operator's act**; the attendee is incidental. Clearing the
   identifier keeps the operator accountable without holding data about someone who exercised
   erasure. Hashing was rejected — a hash of a UUID from a known set is reversible by enumeration.

6. **The assignment-to-conference reference does not cascade.** *Alternative*: `ON DELETE CASCADE`,
   which is semantically tidier. *Why*: **a cascade is not an administrative write, so the audit
   would not record it** — a re-seed would silently strip every organizer's authority. The
   non-cascading reference makes the re-seed fail loudly at development time instead. This mirrors
   008's `shared_cards`, and the constitution predicted this feature would meet it.

7. **The bootstrap credential is a separate command from `pnpm db:seed`.** *Why*: `db:seed` already
   deletes every attendee and re-inserts committed passwords, with nothing enforcing it never runs
   against real data. Putting the product's highest privilege behind its least-guarded entry point
   would be a poor trade. The repository is public, so a committed operator password is a *published*
   administrative credential.

## Areas Needing Attention

**Cross-table email uniqueness is enforced in application code**, where every other uniqueness rule in
this product is enforced by the database. Postgres cannot express uniqueness across `operators` and
`attendees` with a constraint. This matters because FR-918 is load-bearing for FR-915: without it,
sign-in has to try two stores and branch, and the branch is observable — an oracle for who holds
administrative access. Mitigated by both insert paths checking inside their transaction plus a
concurrency test, but **this is the weakest link in the feature** and is worth a reviewer's scrutiny.

**Register entry 4 is escalated more than by any prior feature.** Desktop and tablet layouts have
never been validated by the client; the only approved visual reference is a mobile-only 390×844
prototype frame. The admin product is desk work, so it lives *predominantly* in the width band nobody
has reviewed. Principle IV's gate checks compliance, not design — and 008 proved the distinction
isn't academic when the first human to open a dialog found it in the **top-left corner**, having
passed 135 e2e tests, five review agents and CodeRabbit.

**One path where two route audits disagree.** `/admin/conferences/:eventId/organizers` declares an
event parameter, so `event-scope-audit` will examine it and demand `requireEventAccess` — which it
must *not* have, because a platform operator is not registered for that conference and would fail
that guard correctly. It carries an explicit allow-list entry with the reason written down.

**The conference-organizer tier ships with no capability of its own.** An organizer can sign in and
see their conferences, and nothing else. This is deliberate — the boundary is 012's foundation and
must be independently testable before a large write surface depends on it — but it will look like an
omission to anyone reading the PR without this note.

**Five existing guards are amended.** Each must be narrowed *deliberately*, and none weakened to the
point of checking nothing. `qa-absences.test.ts` is the delicate one: it strips comments before
matching because every forbidden pattern also appears in the prose explaining the absence, and 009
recorded that the natural repair is to weaken the pattern until it checks nothing. **The amendment
narrows by path, not by pattern.**

## Open Questions

Four remain, none blocking. All are recorded in [spec.md](spec.md) § Open Questions.

1. **Whether the resolution note should be free text.** The retention half is answered by the schema
   — `abuse_reports` cascades on both attendees — but whether an operator's free text about two
   people is the right shape is a product question. 007 refused to put the reporter's reason in mail
   on closely related reasoning.
2. **Whether question removal should be reachable outside the report queue.** As specified, an
   abusive question nobody reports cannot be removed. Widening it is adjacent to register entry 19.
3. **Whether the admin product needs its own CI job or extends the existing matrix.**
4. **Whether operator sign-in attempts belong in `sign_in_attempts`** — a table with unusually
   specific reasoning and a retention rule FR-382 forbids lengthening.

**Register entries 19 and 21 are addressed but explicitly NOT closed.** This feature creates the
actor capable of moderating and of reading reports, and v4.1.0 decided what that actor may *see* —
but a capability is not a policy. Nobody is appointed (21), and no standard is set for avatars (19).
Neither may be read as closed by this shipping.

## Review Checklist

- [ ] Key decisions are justified
- [ ] Breaking changes are documented with migration guidance
- [ ] Scope matches the stated boundaries
- [ ] Success criteria are achievable
- [ ] No unstated assumptions
- [ ] **MyNet is unchanged** — the attendee suite passes without modification
- [ ] **The five amended guards still fail** on their forbidden patterns; none weakened to check nothing
- [ ] **`catalog-read-only.test.ts` and `join-grants-nothing.test.ts` are byte-unchanged** (012 and 013 own those)
- [ ] Every `/admin/*` route carries a guard, or an allow-list entry with a written reason
- [ ] Deletion, export and retention are answered for all five new tables, not allow-listed away
- [ ] Admin dialogs are **centred** — not merely functional
- [ ] No notification is dispatched; the trigger audit is unedited

---

<!-- Code phase sections are appended below this line by the phase-manager command -->
