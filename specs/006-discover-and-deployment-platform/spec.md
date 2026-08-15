# Feature Specification: Discover, and the Deployment Platform It Runs On

**Feature Branch**: `feat/006-discover-and-deployment-platform`

**Created**: 2026-08-07

**Status**: Draft

**Constitution**: v3.0.0 — amended by this feature; see the Departure section below

**Brainstorm**: `brainstorm/05-discover-and-the-deployment-platform.md`

**Input**: Phase 006 of the delivery roadmap, enlarged by brainstorm #05. Turn the co-attendee
profile read delivered by 004 into the directory `requirements.md` describes — attendee cards,
search, role and interest filters, an addressable profile detail view, and a Home card of the
feature's own — and, in the same change, move the product onto the deployment platform it will
actually run on, because that platform is what makes a directory of real people reachable.

---

## Context and Scope Note

004 shipped the read this feature consumes. `GET /events/:eventId/attendees/:attendeeId` applies
three conditions in a single predicate — the reader is registered for this conference, the target is
registered for the same conference, and the target is discoverable and verified — and its own route
header states the division of labour explicitly: *"006 is what consumes this. It arrives with a
directory; this feature ships the read it needs and no listing — a list of co-attendees is 006's to
design."*

This feature designs that listing. It also carries the deployment platform, the pre-preview security
posture, and four items of recorded debt, because brainstorm #05 established that each of them is
latent at one profile and load-bearing at a hundred.

### The one property a directory cannot inherit

`readCoAttendeeProfile` collapses four distinct causes — reader not registered, target does not
exist, target not discoverable, target's address unverified — into one 404 with an identical body,
so that FR-361 holds *by construction* rather than by careful call sites.

**A listing cannot preserve that, and this specification states the narrowing rather than inheriting
FR-361's language and silently breaking it.** A reader who knows a particular person is at this
conference and does not find them in the directory has learned something the single-profile read
refuses to disclose. A directory discloses the membership of the discoverable-and-verified set by
construction. That is the inherent cost of the capability `requirements.md` asks for, not a defect
to be engineered away, and FR-404 records it as a bounded, deliberate narrowing.

### Departure from the constitution, and from a shipped feature's requirements

Principle I forbids closing a register entry by inference. This feature departs from **three**
written statements, and it says so here rather than resolving any of them quietly. **The owner
elected to specify before amending**; the amendment was therefore a prerequisite of merge, not of
planning.

> **DISCHARGED 2026-08-07 — constitution v3.0.0.** All three departures below are now superseded in
> `.specify/memory/constitution.md`, which was amended to **3.0.0** — a **MAJOR** bump, because
> retracting 001's delivered FR-066 and SC-011 is the first time this project has withdrawn a shipped
> requirement. This section is retained rather than deleted: it is the record of *why* the amendment
> exists, and the reasoning below is what the amendment cites.

| | Written today | This feature |
|---|---|---|
| Database provisioning | Constitution, *Technology and Architecture Constraints*: "a project-owned API service over a **managed PostgreSQL** database". Restated at constitution line 244 and in four places in `CLAUDE.md` | **PostgreSQL as a loopback-only container on the application VM**, backed up on a cron schedule the project owns |
| Preview deployment — governance | `CLAUDE.md`: "…production build, **preview deploy on every change**" | **One long-lived UAT environment**, deployed on merge to `develop`. Per-change ephemeral previews are withdrawn |
| Preview deployment — **a shipped requirement** | `specs/001-production-foundation/spec.md` **FR-066**: "A successfully verified change MUST publish a preview of **that exact change** at an address a reviewer can open without local setup", and **SC-011**: "A reviewer can open a working preview of any proposed change **from the change itself**" | **Withdrawn.** A UAT environment deployed on merge cannot give the reviewer of an open pull request a preview of that pull request |

**The third departure is the binding one, and it is the reason the amendment cannot be narrow.**
The first two are prose in governance documents. FR-066 and SC-011 are a **delivered functional
requirement and its success criterion**, shipped in feature 001 and verified since. FR-490 removes
precisely the mechanism that satisfies them. An amendment that changes only the constitution's
wording would leave a shipped requirement silently unmet, which is the failure mode Principle I
exists to prevent. **The amendment MUST supersede FR-066 and SC-011 explicitly**, and MUST state
what replaces the reviewer-facing guarantee they encoded — whether that is review against UAT after
merge, a locally reproducible stack, or an accepted reduction in reviewability.

**What survives unchanged from 001**: FR-067, "preview environments MUST NOT be connected to any
data store holding real attendee data". FR-485 carries it forward verbatim in substance and applies
it to UAT.

**The second departure is narrower than it first appears, and the amendment must settle which
reading binds.** Principle VII requires the pipeline to cover "a production build, and a preview
deployment" — it does not say *per change*. A UAT deployment on merge to `develop` arguably
satisfies Principle VII as written. What does not survive is `CLAUDE.md`'s stronger "on every
change", and FR-066's stronger still "that exact change". This specification does not choose between
those readings; it records that they differ.

**What is unchanged.** The API contract remains owned by this project. Schema changes remain
versioned, reviewed migrations verified in CI before reaching any environment holding real data.
Data access remains behind repository interfaces. The choice of PostgreSQL is unchanged — only who
provisions it.

### Departure from the delivery roadmap

The roadmap is a plan rather than governance and may be revised without an amendment, but it
requires a departing feature to say so.

| | Roadmap | This feature |
|---|---|---|
| Scope | Discover alone — cards, search, filters, profile view, interest-overlap ranking | **Plus** the deployment platform, the security posture, and four recorded debt items |
| Migration `0005` | Reserved for 006, described as "(indexes)" | **Unchanged, and used as described** — this feature emits `0005`, and it is an index migration |
| Parallelism | 005 ∥ 006 | **Moot** — 005 shipped first |
| Phases 007–010 | — | **Unchanged**, except that 007 and 008 inherit a settled platform |

### What this feature does not do

No message, share-card or schedule action ships on any card or profile. Those belong to 007 and 008
and appear only when their owning phase lands, registered the way Home cards are. **No dead control
and no permanently-disabled control ships** — the roadmap's rule, adopted here without change.

---

## User Scenarios & Testing *(mandatory)*

**Two stories carry P1, deliberately.** US1 and US4 are independent of one another — neither reads,
writes, or depends on anything the other produces — and each is separately deliverable and separately
demonstrable. They share the top priority because they are jointly, rather than severally, what makes
this phase worth shipping: US1 without US4 is a directory nobody outside a developer's machine can
reach, and US4 without US1 is a well-hosted product with an empty destination. US2 and US3 both
depend on US1 and are ordered behind it.

### User Story 1 - Find someone worth meeting at this conference (Priority: P1)

An attendee at a conference wants to know who else is here. They open Discover and see cards for
their fellow attendees — name, company, role, a short headline, interests, whether the person is
open to meetings, and their face. They type part of a name or a company, or narrow by role or by an
interest, and the list responds. When nothing matches, they are told so and offered a way back to
the full directory.

**Why this priority**: This is the capability the phase exists to deliver, and the second of the
three questions the product answers for the attendee. Without it, Discover remains an empty
destination.

**Independent Test**: Sign in as a seeded attendee registered for a conference that has other
registered, discoverable, verified attendees. Open Discover. Confirm cards render with the declared
fields, that search narrows them, that a role filter and an interest filter narrow them, that
filters combine, and that an unmatched query produces the empty state with a working reset.

**Acceptance Scenarios**:

1. **Given** an attendee registered for a conference with other discoverable, verified co-attendees,
   **When** they open Discover, **Then** they see attendee cards for that conference only, ordered
   by shared-interest count descending.
2. **Given** the directory is displayed, **When** the attendee enters a search term matching a
   co-attendee's name or company, **Then** only matching cards remain.
3. **Given** the directory is displayed, **When** the attendee selects a role filter and an interest
   filter, **Then** only co-attendees matching both remain.
4. **Given** filters that match nobody, **When** the results render, **Then** an empty state explains
   that nothing matched and offers an action that clears the filters and restores the full directory.
5. **Given** a co-attendee who has turned discoverability off, **When** the directory renders,
   **Then** that person does not appear, and nothing on screen indicates that anyone was withheld.
6. **Given** an attendee who has themselves turned discoverability off, **When** they open Discover,
   **Then** the directory renders in full — hiding does not blind them.
7. **Given** an attendee switches to a different conference, **When** Discover re-renders, **Then**
   the directory shows that conference's attendees and none from the previous one.
8. **Given** an attendee who has created an account but joined no conference, **When** they open
   Discover, **Then** they are told that joining a conference comes first and are offered the way to
   do it — not an empty directory and not an error.

---

### User Story 2 - Look at who someone actually is (Priority: P2)

Having found someone interesting, the attendee opens their profile and sees the full picture —
everything the card showed plus the person's headline, complete interest list, networking intent and
availability — at an address they can return to or share with themselves.

**Why this priority**: It closes a recorded gap: `requirements.md` says an attendee can open a
profile, and the prototype has no such screen. It depends on US1 to reach it but is separately
testable by address.

**Independent Test**: Navigate directly to a co-attendee's profile address while signed in as an
attendee sharing their conference. Confirm the profile renders. Repeat for an attendee at a
different conference and for one who is not discoverable, and confirm both refuse identically.

**Acceptance Scenarios**:

1. **Given** a co-attendee visible under the three conditions, **When** the attendee opens their
   card, **Then** a profile view renders at its own address showing the declared fields.
2. **Given** the profile view is open, **When** the attendee dismisses it, **Then** focus returns to
   the control that opened it.
3. **Given** an identifier for someone at another conference, someone who does not exist, someone
   not discoverable, or someone unverified, **When** the profile is requested, **Then** all four
   refuse identically and none is distinguishable from the others.
4. **Given** a co-attendee who has no avatar, **When** their profile renders, **Then** the
   non-photographic fallback renders rather than a broken image or an empty frame.

---

### User Story 3 - Be pointed at people worth meeting (Priority: P3)

On Home, the attendee sees a small number of co-attendees they have most in common with, each
labelled with how many interests they share, and can go from there into the full directory.

**Why this priority**: It is the roadmap's named Home contribution for this phase and the product's
answer to "who should I meet?", but the directory is usable without it.

**Independent Test**: Sign in as an attendee with interests set and confirm the Home card lists
co-attendees ranked by shared-interest count with the count shown. Sign in as an attendee with no
interests and confirm the card's own empty state renders and the rest of Home is unaffected.

**Acceptance Scenarios**:

1. **Given** an attendee with interests set and co-attendees sharing some, **When** Home renders,
   **Then** a card lists the highest-overlap co-attendees with their shared-interest counts.
2. **Given** an attendee who has set no interests, **When** Home renders, **Then** the card explains
   that it needs interests to work and offers a way to add them, and every other card renders
   normally.
3. **Given** the card's data cannot be loaded, **When** Home renders, **Then** the card shows its own
   failure state and no other card is affected.
4. **Given** the card is displayed, **When** the attendee follows it into Discover, **Then** the
   directory opens showing the same order the card was drawn from.

---

### User Story 4 - Reach the product at a real address, and stay signed in (Priority: P1)

Someone opens MyNet at a real, certificate-backed address, signs in, and stays signed in while
using it. Their session survives navigation, and the product behaves the same way there as it does
on a developer's machine.

**Why this priority**: It shares P1 with US1 because the two are independent of one another and
jointly necessary for anything to be demonstrable off a developer's machine. **In the configuration
that exists today, this scenario fails outright**: the API and the client deploy to `fly.dev` and
`pages.dev`, which are separate registrable domains on the Public Suffix List, so the `SameSite=Lax`
session cookie is never sent and sign-in cannot complete.

**Independent Test**: Deploy the stack to an environment, browse to its address over HTTPS with a
publicly trusted certificate, sign in, navigate between destinations, and confirm the session
persists. Independent of every Discover story.

**Acceptance Scenarios**:

1. **Given** a deployed environment, **When** a person browses to its address, **Then** it is served
   over HTTPS with a publicly trusted certificate obtained and renewed without manual steps.
2. **Given** the deployed environment, **When** an attendee signs in, **Then** the session cookie is
   accepted and subsequent requests are authenticated — because the client and the API are served
   from one origin.
3. **Given** a deployed environment, **When** its readiness endpoint is called, **Then** it reports
   healthy only if the database is actually reachable.
4. **Given** a deployed environment, **When** any page is served, **Then** the declared security
   response headers are present.
5. **Given** the database is stopped or unreachable, **When** the readiness endpoint is called,
   **Then** it reports unhealthy, while the existing liveness endpoint remains unchanged in
   behaviour and continues to disclose nothing about dependencies.

---

### Edge Cases

- **The reader has no interests.** Every shared-interest count is zero, so the ranking has no signal.
  The directory still lists everyone, in its deterministic tie-break order; the Home card shows its
  own empty state rather than an arbitrary list.
- **Nobody at this conference is discoverable.** The directory's empty state must be worded so it
  does not imply the conference has no attendees, and must not distinguish "nobody is discoverable"
  from "nobody is registered".
- **The attendee is the only registered attendee.** Same as above.
- **A co-attendee turns discoverability off, withdraws, or deletes their account while the reader is
  looking at them.** The next request refuses. Because nothing is cached, there is no window in
  which a stale copy remains readable.
- **A co-attendee has no avatar.** The fallback renders, and the absence must not be distinguishable
  from "not visible to you" by any means the client can observe.
- **A search term matches nothing, and a filter combination matches nothing.** Both produce the same
  empty state with the same reset action.
- **The reader has joined no conference at all.** Every attendee is in this state between creating an
  account and entering their first join code. Discover explains that joining a conference comes first
  and offers the way to do it — not an empty directory, and not an error (FR-401b).
- **The reader goes offline mid-session.** Discover states that it needs a connection, distinguished
  from a server fault. No previously loaded directory content is retained.
- **A page of results is requested after the underlying set has changed.** The ordering must remain
  stable enough that the attendee does not silently skip or repeat a co-attendee.
- **The certificate cannot be obtained** because DNS does not yet resolve to the environment. The
  deployment must fail visibly rather than serve without TLS.
- **A deployment is rolled back.** The database must not be left ahead of the application in a way
  that no documented step recovers.

---

## Requirements *(mandatory)*

### Functional Requirements

#### The directory

- **FR-401**: The system MUST present a directory of attendees registered for the reader's **active
  conference**, and MUST NOT include attendees from any other conference.
- **FR-401a**: When the reader switches their active conference, the directory MUST re-render against
  the newly active conference, and MUST retain no attendee from the previous one — including in any
  in-flight or partially rendered page.
- **FR-401b**: When the reader has **no active conference** — the state of every attendee between
  creating an account and entering their first join code — Discover MUST show a state explaining that
  joining a conference is a precondition, and offering the way to do so. It MUST NOT show an empty
  directory, a loading state that never resolves, or an error.
- **FR-401c**: The directory MUST remain usable at a conference of at least **1,000 registered
  attendees** without the reader having to wait longer or scroll further than at a conference of
  fifty. This bounds the scale the success criteria are measured against.
- **FR-402**: The directory MUST apply the same three conditions 004 established — the reader is
  registered for the conference, the target is registered for the same conference, and the target is
  both discoverable and verified — enforced **server-side**. An attendee excluded by any of the three
  MUST NOT be present in the response at all, in any field, at any point. *It is not sufficient for
  them to be withheld from display: a response that carries a hidden attendee and relies on the
  client not to render them has already disclosed them.*
- **FR-403**: Discoverability MUST NOT be reciprocal. An attendee who has turned discoverability off
  MUST still read the directory in full.
- **FR-404**: The specification records, and the implementation MUST NOT attempt to conceal, that a
  listing discloses the membership of the discoverable-and-verified set. This is a **bounded,
  deliberate narrowing of FR-361**: the single-profile read's four-way indistinguishability is
  retained unchanged for direct profile requests (FR-431), and the directory adds no *other* signal —
  it MUST NOT indicate that anyone was withheld, MUST NOT report a total that differs from what is
  shown, and MUST NOT distinguish a withheld attendee from a nonexistent one.
- **FR-405**: Each card MUST show display name, company, role, headline, interests, networking
  intent, availability, and an avatar or its fallback.
- **FR-406**: The card MUST NOT expose email address or verification state, by any field, count,
  ordering effect, or timing difference.
- **FR-407**: The system MUST support free-text search over the card's own textual fields. It MUST
  NOT match on email address.
- **FR-408**: The system MUST support filtering by role and by interest, and the two MUST combine
  conjunctively with each other and with the search term.
- **FR-409**: Search, filtering, ranking and pagination MUST be evaluated **server-side**. The client
  MUST NOT receive attendees it then hides.
- **FR-410**: Results MUST be paginated in an order that is **stable and repeatable** for a given
  query, so that a reader paging through an unchanging directory neither skips nor repeats a
  co-attendee.
- **FR-410a**: When the underlying set **changes** between page requests — a co-attendee joins the
  conference, turns discoverability on or off, edits their interests, or deletes their account — the
  system MUST NOT silently present a duplicate of an attendee already shown. Silently *omitting* an
  attendee whose position moved is permitted, because refusing to omit would require retaining a
  snapshot of the directory, which FR-466 forbids. **This is a bounded guarantee, deliberately
  asymmetric**: a duplicate is a visible defect, whereas an omission is indistinguishable from the
  ordinary case of someone who was never there.
- **FR-411**: The directory MUST be ordered by **shared-interest count, descending**, with a
  deterministic tie-break that produces the same order for the same inputs on every render.
- **FR-412**: The shared-interest count MUST be shown on the card.
- **FR-413**: Ranking MUST use only data the card itself displays. It MUST NOT use saved sessions,
  notes, message activity, or any other attendee-private data. *Rationale: 005 made the agenda
  private, and a ranking derived from it would make the score a side channel for data the product
  deliberately withholds.*
- **FR-414**: When no attendee matches, the system MUST show an empty state that explains nothing
  matched and offers an action that clears every filter and search term and restores the full
  directory.
- **FR-415**: The empty state MUST be worded so that it does not disclose whether the conference has
  no attendees, no discoverable attendees, or none matching.

#### The profile view

- **FR-431**: The profile view MUST be reachable at its own address, and MUST reuse 004's existing
  three-condition read unchanged, preserving its single indistinguishable refusal for all four
  causes.
- **FR-432**: The profile view MUST show every field the card shows, plus the complete interest list.
- **FR-433**: The profile view MUST offer a clear, labelled dismissal, MUST dismiss on Escape, and
  MUST return focus to the control that opened it.
- **FR-434**: The profile view MUST NOT carry message, share-card, or schedule actions. Those are
  registered by 007 and 008 when those phases land.

#### The Home contribution

- **FR-446**: The system MUST contribute **one new Home card** by appending a single entry to the
  existing card registry. It MUST NOT edit, reorder, read from, or depend on any other feature's
  card.
- **FR-447**: The card MUST list **at most five** co-attendees — the highest-overlap ones, using the
  same ranking as FR-411 — each with its shared-interest count. Five is a first-viewport card beside
  other cards, not a directory; the full list is one action away.
- **FR-447a**: The card MUST offer an action that opens Discover showing the same order the card was
  drawn from, so the card reads as the top of the directory rather than as a separate list.
- **FR-448**: The card MUST own its loading, empty and failure states, and its failure MUST NOT blank
  or degrade any other card.
- **FR-449**: When the reader has set no interests, the card MUST show an empty state explaining that
  it needs interests and offering a way to add them.

#### Avatars

- **FR-456**: The directory listing MUST carry each card's avatar **within the listing response**,
  rather than requiring a separate request per attendee.
- **FR-457**: Avatars in the listing MUST be served at a **card-sized rendition**, smaller than the
  stored profile rendition.
- **FR-458**: The card rendition MUST be produced by the same server-side decode-and-re-encode path
  that 004 established, so that **metadata absence remains a property of the operation** rather than
  a list of tags to maintain. It MUST NOT be produced by any path that could preserve EXIF.
- **FR-459**: The card rendition MUST be subject to the same three visibility conditions as the
  profile it belongs to. Serving a hidden attendee's face is the profile withheld and the face given
  away.
- **FR-460**: Every stored rendition of an attendee's avatar MUST be removed when that attendee's
  account is deleted. *This extends 004's deletion path, which removes avatar bytes before the
  attendee row; a second rendition that outlived the account would be a silent regression of a
  shipped guarantee.*

#### Offline

- **FR-466**: Discover MUST NOT be cached. It MUST NOT use the caching decorator 005 introduced, and
  no directory content, profile content, or avatar bytes may be retained for reading without a
  connection.
- **FR-467**: Offline, Discover MUST state that it needs a connection, in wording distinguishable
  from a server fault.
- **FR-468**: This is a **declared decision, not an omission**. *Rationale: 005's cache holds the
  reader's own relationship to conference content; a cached directory would hold other people's
  names, employers and faces past a withdrawal of consent, on a device the server can no longer
  reach — and 004 chose hard deletion with no tombstone precisely so that nothing lingers.*

#### The deployment platform

- **FR-476**: The client and the API MUST be served from **one origin**, with the API reachable under
  a path of that origin.
- **FR-477**: The session cookie MUST remain `SameSite=Lax`, which FR-476 makes a genuine CSRF
  defence rather than a nominal one. No synchroniser-token mechanism is introduced, because none is
  needed once the origin is shared.
- **FR-478**: The `Secure` attribute MUST be set on the session cookie in every deployed environment.
  It MUST NOT be possible for a deployed environment to serve a non-`Secure` session cookie.
- **FR-479**: Each environment MUST obtain and renew a publicly trusted TLS certificate without
  manual intervention.
- **FR-480**: Deployed responses MUST carry a Content-Security-Policy including at minimum
  `connect-src 'self'`, `img-src 'self' data:`, `object-src 'none'`, `base-uri 'none'`, and
  `frame-ancestors 'none'`; plus `X-Content-Type-Options`, a `Referrer-Policy`, and HSTS.
- **FR-481**: `img-src` MUST permit `data:` because FR-456 delivers avatars as data URLs. This is
  recorded so that a later tightening of the policy does not silently blank every face in the
  directory.
- **FR-482**: The system MUST expose a **readiness** endpoint distinct from the existing liveness
  endpoint, which reports healthy only after successfully querying the database.
- **FR-483**: The existing liveness endpoint MUST remain unchanged and MUST continue to disclose
  nothing about dependencies to an unauthenticated caller.
- **FR-484**: There MUST be **two isolated environments** — UAT and production — such that a
  deployment, a runaway query, or an exhaustion of resources in one cannot affect the other.
- **FR-485**: Each environment MUST hold its own database, its own secrets, and its own address.
  **UAT MUST NOT be pointed at production data.**
- **FR-486**: The database MUST NOT be reachable from outside its own host.
- **FR-487**: The production database MUST be backed up **at least daily**, on an automated schedule
  requiring no human action. The schedule, the retention period, and the restore procedure MUST be
  recorded in the deployment runbook that ships with this feature, and the restore MUST have been
  exercised successfully at least once before production holds real attendee data.
- **FR-488**: Migrations MUST be verified in CI against a real database before reaching any
  environment holding real data — unchanged from Principle VII, restated because the deployment path
  changes around it.
- **FR-489**: A documented rollback procedure MUST exist, and MUST state what happens when the
  database schema has moved ahead of the application.
- **FR-490**: The vendor-specific deployment paths this feature replaces MUST be **removed**, not
  left disabled: the per-PR API deploy, the per-PR client deploy, the PR-teardown job, and the two
  database-branching jobs. The aggregate pipeline check MUST be recomposed so that it is green when
  the checks that remain pass, and no check may be weakened to achieve that.

#### Debt discharged in this change

- **FR-496**: The platform package MUST express its repository surface using the **actual repository
  types**, eliminating the existing unchecked casts at the call sites. The dependency added for this
  purpose MUST be type-only, so the runtime dependency graph is unchanged.
- **FR-497**: FR-496 MUST be satisfied **before** this feature's own repository work, so that this
  feature adds no new casts that it then removes.
- **FR-498**: Migration `0005` MUST add an index on the attendee foreign key of **both** token
  tables. *Rationale: PostgreSQL creates no index for a foreign key, so every account deletion
  currently cascade-scans both tables — a finding left open by 004's review because the fix requires
  regenerating the schema snapshot deliberately rather than incidentally.*
- **FR-499**: Migration `0005` MUST add an index that the conference join-code lookup can actually
  use, matching the normalisation the lookup performs rather than the raw column.

### Key Entities

This feature introduces **no new tables**. It reads entities 002 and 004 already established, and
adds indexes and one stored rendition.

- **Attendee directory entry** — a *view* over an existing attendee, their profile fields and their
  interests, bounded by the three visibility conditions and scored by shared-interest overlap. Not a
  stored record; it exists only as the result of a query.
- **Card avatar rendition** — a second, smaller stored rendition of an existing attendee's avatar,
  held in the existing object store alongside the profile rendition, keyed to the same attendee, and
  removed with the account (FR-460).
- **Environment** — UAT or production: an isolated host, database, secret set and address. Not
  attendee data; recorded here because FR-484 and FR-485 make isolation a requirement rather than an
  operational habit.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-401**: An attendee can go from opening Discover to viewing a specific co-attendee's full
  profile in **under 30 seconds** without prior instruction.
- **SC-402**: The directory's first meaningful content appears in **under 2 seconds** on a typical
  conference connection, at the scale FR-401c establishes.
- **SC-403**: Narrowing by search or filter produces updated results in **under 1 second** at that
  same scale.
- **SC-403a**: A reader paging through the directory while other attendees are joining and leaving
  sees **no co-attendee twice** (FR-410a).
- **SC-404**: **100%** of attendees who have turned discoverability off, who are unverified, or who
  are registered for a different conference are absent from the directory — verified by automated
  tests against real seeded rows exercising the server directly, not the client.
- **SC-405**: An attendee who has turned discoverability off can still read **100%** of the directory
  their settings would otherwise have shown them.
- **SC-406**: **Zero** email addresses and **zero** verification-state indicators are reachable
  through any directory or profile response, asserted structurally rather than by inspection.
- **SC-407**: A directory page of 24 attendees renders **every face at once**, with no further
  loading after the page has appeared and no per-card image placeholders resolving individually.
- **SC-408**: After an attendee deletes their account, **zero** stored renditions of their avatar
  remain, in **any** size.
- **SC-409**: With no connection, **zero** directory or profile content is readable, and every
  affected surface states that a connection is required in wording distinguishable from a server
  fault.
- **SC-410**: An attendee can sign in to a deployed environment and remain authenticated across
  navigation — a scenario that **fails in the configuration this feature replaces**.
- **SC-411**: Every deployed response carries the declared security headers, verified by automated
  check rather than by eye.
- **SC-412**: A deployment whose database is unreachable is reported unhealthy by the readiness
  endpoint **before** it can receive traffic.
- **SC-413**: A production database restore has been performed successfully at least once from a
  backup taken by the scheduled job.
- **SC-414**: **Zero** unchecked repository casts remain in feature code.
- **SC-415**: Account deletion and conference join both complete in time that does **not** grow with
  the total number of accounts or conferences in the system.

---

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Offline behaviour** (Principle VI) | **Works offline**: the installed shell and navigation, as 001 established; and 005's cached agenda surfaces, unchanged. **Does not work offline**: Discover in its entirety — the directory, the profile view, the Home card, and all avatar imagery. This is a **declared decision, not an omission** (FR-466–FR-468): 005's cache holds the reader's own relationship to conference content, whereas a cached directory would hold *other people's* names, employers and faces past a withdrawal of consent, on a device the server can no longer reach — and 004 chose hard deletion with no tombstone precisely so nothing lingers. **An action attempted offline**: there are no writes in this feature; every read states that a connection is required, distinguished from a server fault. **No caching decorator is introduced, extended, or configured for this feature**, and no cache lifetime is therefore specified — the absence is the decision. |
| **Desktop layout** (Principle IV) | Persistent left rail and top bar unchanged. Discover renders attendee cards in a multi-column grid with the search field and filters above them, remaining visible while results change. The profile view renders as a centred overlay above the directory, which stays visible behind it. Home gains one card in declared registry order; no existing card moves. |
| **Tablet layout** (Principle IV) | Reduced rail unchanged. Cards fall to two columns; search and filters stay above the results and may wrap without becoming a separate screen. The profile view remains an overlay, wider relative to the viewport than at desktop. Home's columns are unchanged apart from the appended card. |
| **Mobile layout** (Principle IV) | Compact header and bottom navigation unchanged. Cards are a single full-width column. Search and filters are touch-sized and MUST NOT require horizontal scrolling at 320px; filters may collapse behind a labelled control provided the active filter count remains visible. The profile view is a **full-width overlay** with a clear close control and Escape dismissal. Home is a single column in declared order. |
| **Empty / loading / failure states** (Principle IV) | **Directory**: loading; no attendee matched the search or filters, with a reset action; nobody discoverable at this conference, worded so it does not disclose which cause applies; **reader has joined no conference yet**, explaining that joining comes first and offering the way to do it (FR-401b); failure. **Pagination**: loading a further page; failure to load a further page without discarding what is already shown. **Profile view**: loading; not available to this reader; failure. **Avatar**: present; absent, rendering the non-photographic fallback, indistinguishable from not-visible. **Home card**: loading; ranked co-attendees; reader has set no interests; nobody to suggest; failure, isolated to the card. **Offline**: every surface above states that a connection is required, distinguished from "this is a problem on our side". |
| **Accessibility** (Principle IV) | Every control introduced has an accessible label, a visible focus state and keyboard operability. The search field is labelled, not placeholder-only. Filters expose their current state and their active count. Result-count changes after a search or filter are announced, so a screen-reader user learns the list changed without discovering it by exploration. Cards are reachable and operable by keyboard in the order they are read. The profile view dismisses on Escape, **confines focus while open**, offers a visible labelled close control, and **returns focus to the control that opened it**. Networking intent and availability MUST NOT be conveyed by colour alone. Avatar images carry appropriate alternative text, and the fallback is not announced as a broken image. |
| **Validation checklist discharged** (Principle VII) | **Attendee search and filter** (full); **attendee cards and profile view** (full); keyboard focus visibility and accessible labels for every control introduced here; production build; desktop and mobile rendering extended to the directory grid and the profile overlay. **Also discharged, beyond the product checklist**: a real deployment path, TLS, and the security response headers. Left to later features: message composition; card-sharing feedback; meeting scheduling and appointment creation; audience Q&A with upvoting. |
| **Identity scoping & server-side authorization** (Principle VIII) | Applies. **Rule**: every directory and profile read is bound to the authenticated attendee at the request boundary **and** to a conference for which that attendee holds a registration, and each *result* is additionally bounded by the target's own registration, discoverability and verification. **Enforcement**: identity comes from the sign-in session, never a client-supplied identifier; the conference predicate is the branded scope only the access guard can construct, which the route audit fails the build for omitting; the target-side conditions are evaluated in the same query that produces the listing, so there is no path that returns a row and then filters it. **Refusals** disclose nothing about existence for direct profile reads. **The listing's disclosure is narrowed deliberately and bounded by FR-404.** **No new personal data is stored** — this feature reads existing records and adds one derived rendition of an avatar the attendee already uploaded. |
| **Deletion & export coverage** (Principle VIII) | **No new table and no new column is introduced**, so the two structural guards — deletion coverage and export coverage — are satisfied without a new allow-list entry, and MUST continue to pass unchanged. **One new stored artifact**: the card-sized avatar rendition. It is reached by the existing account-deletion path, which removes avatar bytes before the attendee row, and FR-460 requires that path to remove **every** rendition rather than only the profile one. **Export**: the export already embeds the attendee's avatar; a second rendition of the same image adds no new information about the attendee and is therefore not separately exported — recorded as a deliberate limit rather than an oversight. **No record introduced here is unreachable by a cascade**, so no new retention clock is required. |
| **Event scoping** (Constraints — data scoping) | **The directory is per-event**, and necessarily so: it is a view over conference registrations, and standing decision 7 places conference content — the Discover directory named explicitly — on the per-event side. It swaps entirely on conference switch. **The card avatar rendition is cross-event**, for the same reason the profile it belongs to is: it is a property of the person, not of any conference, and re-encoding it per conference would be storage without meaning. **No existing table's scoping changes, and no new table is introduced.** |
| **Register position** (Governance) | Assessed against constitution **v3.0.0**, which this feature's amendment produced — the three departures below are **discharged**, not pending. **Resolved by this feature**: **entry 11** — API hosting, the managed PostgreSQL provider and object storage — settled as isolated Azure VMs with PostgreSQL as a loopback-only container and the object store on a VM volume. **Requires an amendment before merge, covering three statements rather than two**: the constitution's "managed PostgreSQL" wording; `CLAUDE.md`'s "preview deploy on every change"; and — the binding one — **001's shipped FR-066 and SC-011**, which guarantee a reviewer a preview of *that exact change* and which FR-490 removes the mechanism for. An amendment touching only the governance prose would leave a delivered, verified requirement silently unmet. See *Departure from the constitution, and from a shipped feature's requirements*. **Substantially resolved by replacement**: **entry 17**'s remaining half — `db-branch`, `schema-diff`, `deploy-api` and `deploy-preview` are removed rather than provisioned, so the secrets they awaited are no longer needed and the aggregate check can go green honestly (FR-490). **Changed but not closed**: **entry 14**, public preview URLs — Cloudflare Pages previews disappear, and a long-lived UAT environment on a public address replaces them, so the access-control question survives in a sharper form; FR-485 forbids pointing it at production data. **Escalated by this feature**: **entry 19**, that nobody moderates uploaded avatar images — this is the feature that renders other attendees' faces at scale to every co-attendee, which converts an unmoderated upload from a private artifact into a broadcast one; and **entry 4**, unvalidated desktop and tablet layouts, which now extends to a card-dense grid and a second overlay. **Relevant but unchanged**: **entry 16**, the repository being public — this feature stores no secrets in the repository, but see the open question on join codes in a publicly reachable UAT. **Not addressed**: entries 1, 2, 3, 7, 8, 9, 10, 12, 15, 18. |
| **Reserved migration number** (Branching — parallel work) | **`0005`**, as reserved by the delivery roadmap for phase 006 and used exactly as the roadmap describes it — "(indexes)". One migration. It carries the indexes this feature's directory query needs, plus the two index findings 004's review left deliberately unclaimed (FR-498, FR-499). No new table and no new column. `0006` remains reserved for 007. Per Principle VII, `0005` MUST be verified in CI — applied forward against a real database with the integration suite run against the result — before it reaches any environment holding real data. |

---

## Assumptions

Reasonable defaults taken where the brainstorm did not specify. Each is a decision the plan may
revisit; none is a substitute for the Open Questions below.

- **The reader does not appear in their own directory.** Discovering oneself has no purpose, and a
  self-card with a shared-interest count equal to one's own interest count would sit permanently at
  the top of the ranking.
- **A shared-interest count of zero is not displayed.** The label is a reason to make contact; "0
  interests in common" is not one. Ordering is unaffected.
- **Search matches on display name, company, role and headline.** These are the card's own textual
  fields. Email is excluded by FR-407; interests are reachable through the interest filter rather
  than through free text.
- **The security response headers are set where they can be tested.** The plan will decide the split
  between the reverse proxy and the application; this specification requires only that they are
  present on deployed responses (FR-480) and verified automatically (SC-411).
- **UAT is deployed on merge to `develop`, production on merge to `main`.** This matches the existing
  branch flow, in which promoting `develop` to `main` is already a reviewed pull request.
- **The existing seeded conference content is used for UAT.** No production-shaped data is created
  for it, per FR-485.
- **Card and profile renditions share one deletion path.** FR-460 is satisfied by extending the
  existing account-deletion routine rather than by introducing a second one.
- **No change to the discoverability toggle, the profile editor, or the verification flow.** This
  feature reads what 004 authors and changes none of it.

---

## Open Questions

Carried deliberately. **None blocks the specification**; the first two block the first deployment
rather than planning, and are owner decisions rather than design ones.

**Blocking the first deployment**

- **No domain name exists.** A certificate cannot be obtained until an address resolves to the
  environment (FR-479), so this gates the first deploy of either environment. *Owner decision.*
- **UAT will be publicly reachable.** The reference pattern opens web access to the world and
  restricts only administrative access. A UAT environment carrying realistically-shaped attendee data
  on a public address **sharpens register entry 14 rather than resolving it**, and interacts with
  entry 19. *Owner decision.*

**For planning**

- **Where the directory listing lives** — a registration-shaped read on the existing identity
  repository, or a new directory-owned interface. The identity repository already spans account
  credentials and event membership, and this listing may be the third registration verb that tips the
  balance; a directory-owned interface disturbs none of 004's code. Deliberately unsettled.
- **How the card rendition is produced** — written at upload time, which requires backfilling avatars
  uploaded before this feature, or derived on read at a per-request cost.
- **Pagination style.** A cursor interacts awkwardly with a score-ordered set whose scores can change
  between pages; an offset does not, at the cost of stability under concurrent registration.
- **What "matches" means for search** — prefix, substring, or full-text — and whether it is
  accent- and case-insensitive for the languages the conference serves.
- **Whether UAT and production share a seed**, and **how the conference join code is handled** now
  that a publicly reachable environment exists and the repository is public. The register already
  carries the world-readable join-code concern; this feature is the first to give it a real
  deployment to be concrete about.

**Recorded, not carried into planning**

- **Whether ranking by shared interests alone is enough** to make the Home card useful in practice.
  It is deliberately the simplest explainable signal (FR-413); whether it earns its place on the
  first viewport is a product judgement worth revisiting once the feature is in use.
