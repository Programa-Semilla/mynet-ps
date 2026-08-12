# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

This file is the **working brief**: what the product is, what has been decided, and how work is
done here. It is deliberately short. Depth lives elsewhere, and these are authoritative over it:

1. **`.specify/memory/constitution.md` (v4.1.0)** — governance and the authoritative decision
   register. Supersedes tool defaults, habit, and any conflicting statement in this file.
2. **`docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`** — the decomposition of
   the remaining product into features, with dependency order, reserved migration numbers, and gate
   schedule. Read before starting any feature. It is a plan, not governance: it may be revised
   without an amendment, but a feature departing from it must say so in its spec.
3. **`specs/<feature>/`** — per-feature spec, plan, tasks, and review findings.
4. **`GroundZero/requirements.md`** — read for **WHAT**, not HOW (see the table below).
5. **`GroundZero/prototype/`** — approved interaction and visual reference only.
6. Existing source code — implementation reference, unless confirmed as production architecture.

When sources conflict on a **WHAT**, **do not resolve by assumption.** Record it as an open
question and settle it with the client.

## Repository layout

```
GroundZero/       # Initialization brief, requirements.md, approved prototype (reference only)
apps/api/         # Fastify + Drizzle over PostgreSQL; versioned migrations
apps/web/         # React + TypeScript PWA; shell, sign-in, five destinations
apps/admin/       # 011 — the SEPARATE administrative website (admin.<host>). No PWA, no
                  #   service worker, no @mynet/platform: it needs none of the seven device
                  #   capabilities, and its absences are structural rather than configured.
packages/data/    # Repository interfaces + HTTP implementations + generated contract types
packages/platform/# Device-capability + storage interfaces, web implementations, repository registry
packages/config/  # Shared TypeScript and Vitest bases
contracts/        # Generated, committed OpenAPI contract
deploy/vm/        # The whole deployment platform: Caddy + API + PostgreSQL, provisioning, backups
e2e/              # Playwright end-to-end tests
brainstorm/       # Design sessions and their decisions
specs/            # Feature specifications
docs/superpowers/ # Design documents and implementation plans
```

## Product

**MyNet** — a multi-event attendee engagement and professional networking platform. It **is** an
authenticated attendee workspace, not a marketing site and not a generic enterprise dashboard.

It answers three questions, in this order of prominence: What is happening next? Who should I meet?
Where are my conversations, notes, and appointments?

The core journey: inspect the next session → discover a relevant attendee → share a card or message
them → schedule a networking appointment.

The **attendee** is the only actor. Speakers and other attendees are data the attendee interacts
with, not users of the system.

**Organizer administration was out of scope for the whole life of this project, and constitution
v4.0.0 — ratified 2026-08-11 — reverses that.** It is the second time this project has retracted
delivered requirements, after v3.0.0 withdrew 001's FR-066, and it is MAJOR for that reason among
two others: Principle III's *"the attendee is the only actor in scope"* is redefined, and the
prohibition that Principle III and D2 each named an amendment as the precondition for is lifted.

**A second actor now exists, in two tiers, and neither is reachable by self sign-up** — which is the
mirror of decision 11's reasoning, because anyone who can sign themselves up as an administrator is
not an administrator. A **platform operator** is seeded, holds product-wide authority, and is the
only tier that may promote or read reports. A **conference organizer** is a promoted attendee whose
authority reaches only conferences they are assigned, and promotion must not alter their attendee
experience at all.

**Administration is a separate website** against the same API and database. **MyNet itself gains no
admin surface, no privileged view, and no role-dependent rendering** — that absence is what keeps
Principle III's attendee-workspace framing true while its actor clause changes, and it must be
testable as an absence rather than asserted. **No administrative tier may edit anybody's profile**:
conference content is authorable, a person is not. The seed stays the dev/test fixture and seeded
conferences become ordinary editable ones — one class of conference.

**Payment processing is NOT reversed.** It shared a sentence with administration and was never the
same decision.

### The five destinations

Each is individually addressable. Home is the entry view, built around the active event.

- **Home** — event switcher, greeting with day context, prominent "Up next" session card,
  rest-of-day timeline, recommended people to meet, appointment summary, unread-message indicator.
- **Agenda** — personal schedule in chronological order; time, track, room, speakers, saved state;
  add/remove; session detail panel with Overview, personal Notes, audience Q&A, Speaker info.
- **Discover** — information-rich attendee cards; search plus role/interest filters; company, role,
  interests, intent, availability; open profile, share card, start a message, schedule a meeting.
- **Messages** — conversation list plus focused thread. Content is private to its participants.
- **Network** — saved contacts, exchanged cards, appointments. Scheduling is a compact modal with
  selectable slots and a short topic field.

Saved sessions, notes, Q&A votes, conversations, cards and appointments are **durable,
per-attendee, server-side state**. The prototype's local-only behaviour is a prototype artifact.

### Domain terminology

- **Event** — a conference the attendee is registered for; name, location, day N of M; switchable.
- **Session** — a scheduled item with time, title, room, track, optional speaker.
- **Track** — a session category, visually coded (Design, Product, Tech, Keynote, Main Event).
- **Saved session** — a session added to the attendee's personal Agenda.
- **Attendee / profile** — a person with company, role, interests, networking **intent** (e.g.
  "Open to meetings") and **availability** (available / busy).
- **Digital business card** — shareable contact payload; sharing produces a confirmation state.
- **Appointment** — a confirmed time slot with another attendee plus a short topic.
- **Conversation / thread** — the message history with one attendee.
- **Q&A** — audience questions on a session, with upvotes.
- **Up next** — the attendee's next session, given first-viewport prominence.

## Current state

Shipped: the production foundation (001), event context and the session catalog (002), attendee
identity and profile (004), Agenda as a personal schedule (005), and **Discover with the
deployment platform it runs on** — feature 006, squash-merged to `develop` in
[#13](https://github.com/Programa-Semilla/mynet-ps/pull/13).

**007 (Messages, and the notification delivery platform) is shipped** — conversations, the thread,
block and report, unread state and Home's indicator, deletion honesty, and **Web Push that actually
delivers**. Its Phase 7 was gated on a constitution amendment and is no longer: **v3.1.0** resolved
register entry 10 in part, bringing delivery into scope for a received message and nothing else.

**Notification delivery is real, not simulated.** `WebPushService` signs with a VAPID pair and POSTs
to whichever push service the browser chose, and it has been verified end to end on a desktop:
message sent → OS notification → activating it opens the conversation. The recording sink remains
the fallback when no keys are configured, chosen by configuration alone so a local run is the
production path rather than a special mode.

**T148 — the by-hand `quickstart.md` walkthrough — was NOT completed before merge.** Scenario 5 was
walked (twice, including a real desktop delivery); scenarios 1–4 and 6 were not. It carries forward
as the outstanding validation for this feature, and it is also the only review the desktop and
tablet layouts have had.

**Nothing has been deployed yet, and that is not a gap in the code.** `deploy/vm/` is complete —
two Azure VMs, Caddy with automatic TLS, a loopback-only PostgreSQL container, backups and a
runbook — but two owner decisions gate the first deploy: **no domain is registered** (Caddy cannot
obtain a certificate without a resolving A record) and **no Azure subscription is named**. The
`deploy-uat` and `deploy-prod` jobs print what they are blocked on and exit 0 rather than failing
every merge.

An attendee creates their own account, joins a conference by code, and arrives at the conference
happening now — greeted by name, told which day it is in the venue's timezone. Home shows what is
next, what remains of the day, what is next from their saved sessions, and who is worth meeting.
Agenda carries the whole programme with an All/Saved filter and an addressable session detail
panel. Discover carries the attendee directory with an addressable profile view over it.

Messages carries private 1:1 conversations that are **permanent and independent of the active
event**: any attendee sharing a current event may open one with any other, with no request and no
acceptance step, and once open it stays open. The thread polls every three seconds while it is open
and the tab is visible; blocking and reporting are server-enforced, and a report leaves the product
as operator mail that nothing inside it can read.

**008 (Network — contacts, exchanged cards, and appointments) is shipped**, squash-merged to
`develop` in [#15](https://github.com/Programa-Semilla/mynet-ps/pull/15) — the spec, constitution
v3.2.0 and the implementation in one PR, because the amendment gated the code. The fifth and last
empty destination now carries content, so **every destination `requirements.md` names answers its
question**. Audience Q&A arrives in 009, as a third section on the panel 005 built, and it is the
last feature that adds behaviour.

**010 (Brand mark and application icons) is implemented**, on its constitution amendment v3.3.0.
The owner supplied a brand board on 2026-08-10, which closed **register entry 2, the oldest in the
register**: MyNet had no logo for the whole life of this project, and the placeholder built under
that gap was a coral disc **struck through by an amber diagonal band** precisely so it could never
be mistaken for a decision. **That placeholder is gone.** The three install icons are replaced at
the same names and sizes, `index.html` gained the favicon and `apple-touch-icon` links it had
**never had**, the mark is on the rail, the top bar and the five auth screens, and the manifest
declares screenshots. Scope was core-only: the iOS splash matrix, the monochrome variant and a
vector redraw are **booked**, per item, in
`specs/010-brand-mark-and-app-icons/follow-ups.md`. **Nothing it ships is upscaled**: planning
corrected the brainstorm's 1.37× figure — the maskable safe zone is a *circle* of 80% diameter, so
the largest mark fitting a 512px maskable icon is 297.9px against a 300px native master, and sizing
it to 80% of the *side* instead would have put the node terminals outside the safe zone to be
clipped.

**A deep review followed, and it is recorded in
`specs/010-brand-mark-and-app-icons/review-findings.md`** — 31 findings, 22 fixed. Three of the
five agents independently found the same defect, which is the single most useful thing it produced:
**the only assertion for the precache exclusion could never run.** It was a unit test guarded by
`it.skipIf(!existsSync('dist/sw.js'))`, and the unit layer is by definition the one that does not
build — CI's `test-unit` job has no build step, and `pnpm verify` orders `test:unit` *before*
`build`. It skipped on every CI run and, locally, asserted against a stale worker. In the feature
whose thesis is that a check which did not execute has not passed.

**Three things the review changed that are now invariants:**

- **`scripts/brand-audit.mjs` is where build-output claims are asserted**, and it runs in
  `pnpm verify` after `pnpm build` and as its own CI step. A missing worker is a **failure**, not a
  skip. It also closed two guarantees that had no gate at all — regeneration is byte-identical
  (FR-806/FR-803), and the built manifest matches its declarations with token-derived colours.
- **Nothing is upscaled, and that is now enforced rather than asserted in prose.** One asset
  contradicted it: `icon-512.png` rendered the mark 317px from a 300px master. Fixed by capping the
  fill rather than weakening the claim. The in-app mark had the same fault from the other end — 96px
  drawn at `h-10` is 1.25× on a 3× phone — and is now 160px.
- **Install icons and favicons are NOT precached; the two in-app marks are.** Those requests are
  issued by the browser process and never reach the service worker, so caching them was 79KB nobody
  could use. `globIgnores` does **not** govern them — `vite-plugin-pwa` re-adds manifest icons after
  the glob — `includeManifestIcons: false` does. Precache: 805KB → 715.85 KiB.

**Its by-hand validation is outstanding, and it is the only thing outstanding.**
Quickstart scenarios 5–9 — install on a device, the tab strip at 16px, the shell at three widths,
the five auth screens, a screen-reader pass — have not been walked, because they need a phone and a
person. Everything a machine can check is checked and green.

**The first look at the shell did find something, and it is pre-existing rather than new.** At
every mobile width the top bar's product-name label is truncated — it needs 60px to render "MyNet"
and has 43–58px **without the mark at all**, so it was already rendering as "M…" before this
feature. The mark takes a further ~9px at 390px. FR-825 is satisfied (the label yields, no control
moves) and 010 did not cause it, so it was recorded rather than fixed: redesigning the mobile top
bar is register entry 4's territory and the owner's call.

**A second layout question is open for the same reason.** The spec justified putting the mark in
the tablet top bar with "the rail is desktop-only", and that is **false** — `TabletRail` is live
768–1279px on the inverse surface, carrying navigation and no brand. `DesktopRail` is the
desktop-only one. The shipped arrangement satisfies FR-823 and FR-824 either way, but the
alternative — the mark at the head of `TabletRail` in coral, mirroring `DesktopRail` — was never
weighed, because the spec recorded that surface as not existing. Corrected in the spec; the
arrangement is an owner decision under register entry 4.

A contact is somebody whose digital business card you hold. Sharing is **one-directional** — it
gives your card and takes nothing — and a held card resolves the sharer's **live** profile under a
standing consent that outlives both the conference and the discoverability toggle. Appointments are
proposed, then accepted or declined, over a seeded 30-minute slot grid whose availability is a
function of the reader's own commitments alone. Home gained its seventh and last card, which is the
**only** way an attendee learns somebody has proposed a meeting: this feature dispatches no
notification, and the bell stays forbidden.

**009 (Session Q&A — audience questions and upvotes) is shipped**, squash-merged to `develop` in
[#17](https://github.com/Programa-Semilla/mynet-ps/pull/17) — the implementation and constitution
v3.3.0 in one PR, because the amendment gated the code, as 008's did. **With it the delivery
roadmap is complete**: every feature 001–009 is delivered and every destination `requirements.md`
names answers its question. What remains is 010, which adds no schema and no feature.

**Planned as two PRs and delivered as one.** The split existed so a reviewer could read the safety
half as a unit; both halves were complete and green, and holding the first open would have shipped
a Q&A surface with **no way to report anything on it** — which the Success Criteria forbid calling
complete. The boundary survives as a reading order rather than as two merges.

A question is asked on a session, published to **every attendee registered for the conference
under the author's real name with no opt-out**, and ranked by upvotes. That visibility is the
**second recorded exception** to Principle VIII's "private content stays private" — constitution
**v3.3.0, ratified 2026-08-10**, which gated the first line of code exactly as v3.2.0 gated 008's.
009's own artifacts drafted it as a *third* exception, counting v3.2.0's N2; **N2 is an exception
to the discoverability toggle, not to private content**, and the count was corrected at
ratification.

It arrived as a **fourth stacked section** on 005's panel, not the prototype's tab strip — 005
built the panel for exactly this and `PanelNotes` says so in its own header. **It introduced no
new architectural concept**: no branded scope, no fourth route audit, no cache classification, no
notification trigger. Every mechanism it needed already existed, which is why its plan describes
the approach as "almost entirely inheritance".

**The one question v3.2.0 left open for this phase is answered and is now an invariant**: a
departing attendee's questions go, and **everybody's votes on them go too** (owner decision 1).
Nothing survives de-attributed — no placeholder, no tombstone. 007's answer for conversations
does not transfer, because a conversation holds the survivor's own words and a question by
somebody who has left holds nobody's.

**Safety shipped with it, as PR-B.** A question is reportable **from the question**, without
opening a conversation first (FR-781) — this is the product's first unmoderated many-to-many
surface, and reporting is what makes it survivable in a product with no organizer. 007's
`ReportDialog` moved to `apps/web/src/app/safety/`, and **`report_submit` throttling closes a gap
007 left**: reporting is the only action that sends mail out of the product, so an unthrottled
route was an unthrottled relay pointed at the single address a human is supposed to read.

**Four defects were found during implementation, and three of them only by tests written for the
purpose.** They are listed because each is the shape of mistake the next feature would repeat:

1. **PostgreSQL's `trim()` strips spaces only.** `length(trim(body)) > 0` accepted `"\n\t \n"`
   while the route — using JavaScript's Unicode-aware `String.prototype.trim` — refused it. The
   two layers disagreed and the weaker one was the last line of defence. Found by the validation
   test that drives the column **with the route bypassed**, which is why that file tests the two
   layers separately instead of driving the route twice. The constraint is now
   `btrim(body, E' \t\n\r')`.
2. **Reading hook state inside a handler closes over a stale value.** The composer cleared its
   field on `if (!questions.error)`, which is `null` at the moment the handler was created — so
   **every** outcome looked like success and a refused post destroyed the attendee's typed
   question. The hook's writes now resolve to whether the server accepted.
3. **A success that lands late wipes what the attendee has typed since.** The clear ran
   unconditionally on the response, so somebody starting their next question while the first was
   in flight lost it. It now clears only if the field still holds what was posted.
4. **React delivers a nested dialog's `cancel` to ancestor handlers, and research R2 predicted
   the opposite.** R2 reasoned the platform sends `cancel` to the topmost dialog alone and said
   the point was worth asserting rather than assuming — the assertion found the reasoning wrong.
   One Escape on the withdrawal confirmation closed the confirmation **and** the panel, changing
   the address. `SessionPanel` now compares `event.target` against its own dialog.

**T097 — the by-hand `quickstart.md` walkthrough — was NOT completed for 009 either.** It joins
007's and 008's outstanding walkthroughs rather than replacing them. Everything it covers is
asserted by integration, component and end-to-end tests, and this feature's e2e does walk two
browser profiles through asking, seeing and upvoting — but the eight scenarios have not been
walked by a person, and neither have the desktop and tablet layout reviews.

**T148 — the by-hand `quickstart.md` walkthrough — was NOT completed for 008 either**, and it
shipped without it. Everything it covers is asserted by integration, component and end-to-end
tests, but the two-browser-profile walk has not been done, and neither have the desktop and tablet
layout reviews it carries (T149). It joins 007's outstanding T148 rather than replacing it.

**It stopped being a theoretical gap.** The owner opened the scheduling dialog and found it in the
top-left corner of the viewport — a defect that had passed 135 e2e tests, five review agents and
CodeRabbit, because every one of them checks behaviour and none of them looks at where a thing is.
Two dialogs were affected. Whatever else T148 is worth, **layout is the part of this product no
gate examines**, and the first person to look found something.

**Both questions 008's spec left to planning were answered yes, and the answers are now
invariants.** Card resolution did need a **third branded scope** — `CardScope` and a third route
audit, because `event-scope-audit` reports success on a route naming no conference and walks
straight past `/cards/…`. The meeting-slot grid is seeded as six 30-minute slots per conference
day, in venue-local time.

**A deep review followed implementation and is recorded in
`specs/008-network-and-appointments/review-findings.md`** — 42 findings, 29 fixed. Two corrected
the compliance claim itself (FR-647 was half-implemented, SC-604 unmet), and three defects were
silent and serious: a cache purge on opening the scheduling dialog, an enumeration oracle on
proposing, and an error classification that swallowed every message the routes wrote to be read.
**One finding is deliberately unfixed and is an owner decision**: whether proposing a meeting
should require the invitee to be discoverable, as sharing a card does. The agents' fix would
contradict the spec's stated Assumptions, so the question was recorded rather than resolved.

**The last two defects were found after the gate passed, and neither was findable by reading
source.** The fix for the cache defect was right in reasoning and wrong in mechanics — it returned
an unbound method, so a `#private` field failed against the Proxy and *nothing could be scheduled
at all*; unit, component and integration were all green on it and only e2e caught it. Then the
owner reported the scheduling dialog rendering in the **top-left corner**, which no behavioural
test could see. Both are written up as invariants above.

**Migrations claimed so far run to `0008`** (`0008_session_qa.sql`; 010 added no schema). **Feature
011 reserves `0009`.** The journal lists `0003` before `0004` while carrying a
later timestamp — `apps/api/migrations/meta/README.md` explains why both halves are load-bearing and
what a regenerating feature must not "fix". Anyone regenerating must move that README aside first,
because `drizzle-kit generate` JSON-parses every file in `meta/`.

## Architectural invariants

Established by shipped features. A later feature inherits these; changing one is a decision, not a
refactor.

**Server-side enforcement**

- **Event scope is a branded type only `requireEventAccess` can construct**, demanded by every
  per-event query. A route audit fails when a route declaring an event parameter lacks the guard,
  and a lint rule closes the brand's type-assertion escape hatch.
- **Two coverage tests fail a *future* feature's build.** `tests/unit/deletion-coverage.test.ts`
  fails when a table storing attendee data has neither a cascade from `attendees` nor a declared
  retention rule; `tests/unit/export-coverage.test.ts` fails when a collected column has no export
  coverage. Both derive expectations from the Drizzle schema, so **a new table or column fails by
  existing**. Allow-listing requires writing down why.
- **Verification gates exactly one thing: discoverability.** An unverified attendee uses the
  product fully and appears to nobody — so any profile that can be read already carries a verified
  address, and no feature may use verification state for anything else.
- **`sign_in_attempts` is deliberately not deleted with an account.** It has no foreign key by
  design; deleting a departing attendee's rows would let an attacker clear their own trail by
  registering and deleting. It expires on the two-hour sweep, which FR-382 forbids lengthening.
- **Throttling is per action.** Reset-request is configured so it **may delay but can never deny** —
  an identifier-keyed denial only ever harms the victim.

**Append-only extension points** — contribute a line and your own file; never edit a neighbour's.

- `apps/web/src/app/home/registry.ts` — Home cards.
- `apps/web/src/app/navigation.ts` — a destination declares its own element and nested addresses.
  `routes.tsx` names no address literally.
- Repository interfaces, API route registration, and the seed are split per domain.
- `Repositories` in `packages/platform` — adding a repository is one line; `registry.tsx` is
  untouched. Platform takes a **type-only** dependency on `@mynet/data` so the registry names real
  interfaces; `apps/web/tests/unit/repository-casts.test.ts` keeps the unchecked casts gone.

**Client behaviour**

- **Offline reads come from a caching decorator at the repository boundary** — no component knows
  it exists — keyed `(attendeeId, eventId, resource)` with a **24-hour lifetime**. Every cached
  surface states when it was retrieved. Writes are **refused, never queued**: no write queue, no
  optimistic update, no conflict merging.
- **Discover is deliberately not cached**, and the refusal is declared rather than omitted: age is
  the wrong clock for a discoverability setting that takes effect on the next request, and a cached
  directory is other people's personal data ageing on a device after they chose to be invisible.
- **`CatalogRepository` is read-only in perpetuity**, asserted by name-shape over its exports.
  Attendee state *about* conference content belongs in its own repository.
- **A modal `<dialog>` is centred by the base rule in `theme/tokens.css`, not by each dialog.**
  The user agent centres a `showModal()` dialog with `margin: auto`; Tailwind's Preflight sets
  `margin: 0` on every element and takes it away, pinning the dialog to the **top-left corner**.
  005 and 006 each rediscovered this and patched it locally with `m-auto`; 004's `ConfirmDialog`
  and 008's `ScheduleDialog` did not, and both shipped mispositioned. It is invisible to every
  behavioural test — the dialog opens, traps focus, closes on Escape and reads correctly — so
  `e2e/responsive.spec.ts` now measures the gap on either side. The existing width assertion
  never looked at position, which is how it survived.
- **The detail panel is a native `<dialog>` with `showModal()`** — focus trap, background inertness
  and Escape come from the platform. Focus restoration to the opener is explicit, because
  `<dialog>` does not do it reliably. **007's confirmations reuse `ConfirmDialog` rather than
  opening a second one**: the ordering is what is easy to get wrong (restore focus *after*
  closing, because an inert element cannot take it), and a duplicate is a second place for it to
  drift.

**Directory (006)**

- **The directory is one query** — three visibility conditions, search, both filters, the
  shared-interest count, ordering and the keyset bound. They are not separable because the page is
  chosen *by* rank. Its only input from outside the conference is the reader's own interest set,
  which is what makes "ranking may read only what the card shows" structural.
- **Pagination's guarantee is asymmetric by design**: no duplicate ever, omissions permitted.
  Keyset cannot cover a score that *falls* below the cursor; the only server-side fix is a snapshot
  nothing may retain. `useDirectory` de-duplicates against the list it is rendering — not a cache.

**Messages (007)**

- **Participation replaces event scope as the authorization predicate.** A conversation has two
  owners and is cross-event, so `EventScope` cannot reach it — and worse, `event-scope-audit`
  *silently passes* a route naming no conference. A branded `ConversationScope`, a
  `requireParticipation` guard and a **second route audit** replace it. 008's appointments inherit
  this.
- **Refusals are indistinguishable by construction, and the shapes differ deliberately.** A
  conversation you are not in is **404**, identical to one that does not exist (a 403 confirms two
  specific people are talking). A blocked send is a **reasonless 409** (FR-537). A conversation
  closed by the counterpart's deletion is **403 with an explanation** — a fact about a thread the
  caller can already read in full.
- **Nothing in Messages is cached, and the refusal is declared per member** at the composition
  root. Message content is the most sensitive data in the product; the decorator revokes on age
  alone, and every write here is refused rather than queued.
- **Deleting an account removes its messages from every conversation**, including the other
  person's view. The survivor keeps a one-sided read-only thread with `counterpart: null` — no
  name, no avatar, no identifier. A conversation nobody is left in is removed, which no cascade
  can do because `conversations` deliberately holds no attendee foreign key.
- **The message cursor carries microseconds while the wire carries milliseconds.** A millisecond
  bound silently skips every row sharing the page boundary's millisecond; it failed
  *intermittently* until fixed.
- **`VisibilityService` is a seventh device capability**, added for the visible-only poll and
  argued in `packages/platform/src/interfaces/index.ts`. `substitution.test.ts` is what forced it to
  be declared rather than added quietly; **v3.1.0 ratified it** into Principle V.
- **Absences with tests**: no message edit or delete route or column (FR-516), no report read
  surface anywhere (FR-548), no read receipt, delivery tick, typing indicator or presence (M5), no
  notification bell or notification centre (FR-560), and **a received message is the only thing
  that dispatches a notification** (FR-561). That last one is a source-level audit over
  `apps/api/src`, and it exists to stop 008 and 009 adopting the platform for appointments and Q&A
  without a decision: **a second trigger has to edit the test, and editing it is the conversation.**

**Notification delivery (007)**

- **The platform is vendor-free at the port, and there was never a vendor to choose.** `PushService`
  in `apps/api/src/notifications/` returns `'delivered' | 'gone' | 'failed'` — the three outcomes
  that differ in what the caller must *do*. Two implementations: `WebPushService` signs with the
  VAPID pair and POSTs to the endpoint **the browser issued** (`fcm.googleapis.com` for Chromium,
  Mozilla's for Firefox), and a **sink adapter** records rather than sends. The port is what made
  the phase buildable before either existed.
- **The adapter is selected by configuration, in every environment identically.** VAPID pair
  present → real delivery; absent → the sink. No environment branch, so a local end-to-end test
  exercises the production path. `web-push` is confined to `apps/api/src/notifications/` by the same
  lint boundary that confines storage vendors.
- **The service worker runs in `vite dev` too, and `main.tsx` registers it explicitly.** 001 left
  `devOptions: { enabled: false }` because only `vite preview` needed a worker; **Web Push is
  impossible without one**, so `pnpm start` could not test notifications at all. `injectRegister`
  only injects at build time, which is why registration moved into source — it now happens
  identically in dev and production.
- **A dead subscription is discarded; a failing one is not.** The asymmetry is deliberate:
  over-retrying a dead endpoint costs a request, while wrongly discarding a live one silently stops
  that person receiving anything ever again.
- **A subscription is keyed on the endpoint alone, never on `(attendee, endpoint)`.** The same
  browser profile signed into two accounts in turn issues the *same* endpoint; keyed on the pair,
  the first account's row survives and one attendee's messages are delivered through another
  attendee's registration. Re-registering **reassigns** the device to whoever holds it now.
- **The service worker is hand-written source** at `apps/web/src/sw.ts` (`injectManifest`, not
  `generateSW`): a `push` handler is code and configuration cannot express one. Everything the
  generated worker did is carried across explicitly, **the API denylist most of all** — without it
  the HTML shell is served in answer to API requests, and a failed request looks like a successful
  page load. It is typechecked by its own `tsconfig.sw.json`, because a `lib="webworker"` file
  inside the application program redefines the application's DOM globals.
- **Permission is explained before it is requested, by construction.** `NotificationPrompt.tsx` is
  the only caller of `requestPermission` in the client, and a unit test asserts that. It renders
  nothing at all once it has been answered — there is no bell to become.
- **Denial is a complete outcome, not a degraded one.** It is recorded so nobody is asked twice, and
  `push-denied-fallback.test.tsx` re-runs the US1–US4 surfaces with permission denied to assert they
  are unchanged.

**Network (008)**

- **A third branded scope, because a card route names no conference.** `CardScope` and
  `requireHeldCard` mirror 007's participation guard, and `card-audit.test.ts` is a **third** route
  audit — `event-scope-audit` examines a route only if it names an event and **reports success
  otherwise**, so it walks straight past `/cards/…`. The predicate is **directional** where
  participation is symmetric: it asks whether the reader holds a card *from* the named attendee,
  never the reverse, which is what stops sharing your own card granting you a read of theirs.
- **Appointments are per-event and deliberately named so in the URL.** `/events/:eventId/…` puts
  them *inside* the guarantee that already exists. Registering them as `/appointments/:id` would
  name no conference and the event audit would silently pass them. **007 predicted the opposite**
  — that appointments would inherit its guard — and 008 corrected that comment in both files it
  appears in.
- **One feature, two scoping rules, and neither is the default.** `shared_cards` is cross-event;
  `appointments` and `meeting_slots` are per-event. The client mirrors it exactly: `CardRepository`
  takes no `eventId` **at all**, so no later edit can scope contacts to the conference on screen.
- **The three absences in card resolution are the feature.** No discoverability condition
  (FR-612), no verification condition (FR-613), no registration join (FR-614) — each looks like a
  forgotten `WHERE`, and the directory query one file over has all three. Sharing checks them;
  *resolving* must not. Discoverability governs being **found**, not being **remembered**.
- **Availability is computed from the reader's commitments alone**, and a **received** proposal
  consumes nothing. Two separate guarantees that read alike: one stops the reader learning the
  invitee's schedule from which options vanish (a leak *by omission*), the other stops anyone
  consuming a stranger's whole day by proposing into it. Double-booking is caught at acceptance
  instead — the one refusal in this feature that **carries a reason**, because it describes the
  reader's own diary to the reader.
- **Blocking suspends a relationship and ends a commitment, and those are different.** A card is
  severed **read-side**, so lifting the block restores the contact with no write; an appointment is
  **cancelled** by a write and stays cancelled. Read-time filtering was rejected precisely because
  lifting a block would resurrect a cancelled meeting. This is the single place 008 edits a file
  007 owns — one call in `db/queries/blocks.ts`.
- **`lapsed` is derived from the slot instant and stored nowhere**, which is what keeps this feature
  free of any background job. A stored fifth status would need a sweep, and `RETENTION_SWEEPS` is
  for data no cascade can reach — which this is not.
- **A card cannot be recalled**, and appointments cascade away entirely with either account. Unlike
  007's conversations there is **no one-sided survivor**: a conversation holds the survivor's own
  words, a card whose subject is gone has nothing to preserve.
- **Contacts must never be derived from conversations or appointments** (constitution v3.2.0 N1),
  asserted over the source. 007's open send makes a conversation unilateral, so deriving them would
  let a stranger insert themselves into somebody's Network with one message.
- **Withdrawing from a conference cancels the live meetings you had at it**, in the same
  transaction. Not doing so was the trap: the departing attendee fails `requireEventAccess` and so
  can no longer see or cancel the meeting, while the other party can still accept it and turn up.
  This is the **second** place 008 writes into a file another feature owns, after `blocks.ts` —
  both are one statement, both are cancellations, both for FR-637a's reason.
- **A read that must stay live has to SAY so.** The caching decorator treats every method not
  named in `reads` as a **write**, and a write purges the whole conference prefix. `slots` is a
  live read, and omitting it looked right while silently wiping the cached programme, saved
  sessions and notes every time the scheduling dialog opened. `CacheOptions.passThrough` is the
  declaration; the next uncached read must use it. **Its handler binds to `target`** like every
  other branch — every HTTP repository holds its client in a `#private` field, and a Proxy does
  not carry one, so returning the bare method throws `TypeError: Cannot read private member`. The
  decorator's own test therefore uses a **class with a private field**, not an object literal:
  the double's shape is the assertion.
- **Client error classification branches on `error.code`, never on the class.** `ApiError extends
  RequestRefusedError` and *every* non-2xx throws `ApiError`, so `instanceof` catches 400, 404,
  429 and 500 alike — which rendered the deliberately reasonless refusal for all of them and
  swallowed the messages routes wrote to be read.
- **A refusal's follow-up question must be about the READER.** Asking whether the *invitee* was
  registered, to choose between 400 and 404, made proposing an enumeration oracle for another
  attendee's presence — the caller controls the slot, so the invitee was the only variable.
- **The seed clears the whole Network domain, not only what it seeded.** `shared_cards.event_id` is
  `ON DELETE NO ACTION` deliberately, so a surviving card refuses `DELETE FROM events` and breaks
  the re-seed with an error naming neither table. The next feature with a non-cascading reference
  to seeded content will meet this.

**Session Q&A (009)**

- **No fourth branded scope and no fourth route audit, and that is an outcome rather than a
  saving.** A question always belongs to a session and a session to exactly one event, so
  `EventScope` reaches it — **provided every address says so**. Three of the five routes could
  find their question from `:questionId` alone and name their conference anyway, because
  `event-scope-audit` examines a route only if it declares an event parameter and **reports
  success otherwise**. Tidying `/events/:eventId/questions/:id` to `/questions/:id` would remove
  these routes from the only guard covering them while the whole suite stayed green. A dedicated
  assertion now pins the naming rule, which is the cheapest of the three mechanisms 007 and 008
  each had to build.
- **The audit's conference-content predicate was narrowed, and the narrowing is a decision.** It
  matched any path *containing* `/sessions`, which flagged `POST …/sessions/:id/questions` — a
  write to **attendee state about conference content**, which is 005's distinction. It now asks
  what a path *addresses*: the last non-parameter segment. 005 dodged this only by accident of
  naming (`/agenda/saved/:sessionId`); Q&A is the first attendee-owned resource that genuinely
  nests under a session. The predicate is checked against a table of paths that must still be
  caught, because a guard exercised only by the routes that happen to exist stops guarding when
  they change.
- **The author join applies NONE of the directory's three conditions**, and each absence is the
  feature: not discoverability (FR-734), not verification (FR-735), and no registration join.
  `listDirectory` one file over has all three, so a reader arriving from it will see this query
  as incomplete. Attribution has no opt-out — that is what v3.3.0 records — and consulting
  verification would be a second use of a signal the constitution reserves for discoverability
  alone.
- **A vote count is `count(*)` at read time and must never become a column.** A denormalised
  counter is a second source of truth for a number the rows already answer, and the one that
  drifted would be the one displayed. 008 records the same reasoning for `lapsed`.
- **The composite primary key on `question_votes` IS one-vote-per-attendee.** Enforced by the
  schema rather than by handler logic, so a double-tap is the same request twice and no code path
  exists that could produce a duplicate by forgetting to check.
- **Withdrawal re-checks "no votes" inside the deleting transaction, with the question row
  locked.** `SELECT … FOR UPDATE` conflicts with the `FOR KEY SHARE` a vote insert takes on its
  parent, so a vote arriving between the reader seeing "you can withdraw this" and pressing the
  control blocks until the transaction ends. Checking before the transaction is the race FR-714
  exists to close, and it is the one property no layer but a real database can test.
- **Every write returns the full re-ordered list.** The only shape satisfying immediate update,
  server-side ordering and focus preservation at once — and the last of those is why rows are
  keyed on the question id: focus is lost when a node is **unmounted**, not when it is moved.
- **The repository is undecorated, which makes the offline rules structural rather than
  classified.** `cached` treats every method not in `reads` as a write and a write purges the
  whole conference prefix — 008's defect. Not decorating removes the mechanism instead of
  configuring it: there is no `reads` map to omit from and no `args[0]` to misread. **Do not add
  `cached` here to gain `passThrough`.**
- **Two explained refusals, and both pass the same test — the follow-up question is about the
  READER.** Withdrawal refused because a vote exists, and a vote refused because the caller is
  the author. Everything else is the indistinguishable 404. The client classifies on
  `error.code`, never on the class, and a test requires all five outcomes to be **different from
  each other** — the property `instanceof` classification destroys, and the one that would have
  caught 008's swallowed messages.
- **Blocking filters the read and enters no aggregate.** Bidirectional, pair never ordered,
  nothing written — so lifting a block restores the questions with no repair path, the deliberate
  opposite of what a block does to an appointment. A block changes **no other reader's count**,
  including a vote the blocker already cast.
- **A nested dialog's `cancel` reaches ancestor React handlers.** The DOM event does not bubble;
  React's synthetic system delivers it anyway. `SessionPanel` compares `event.target` against its
  own dialog, and without that one Escape on an inner confirmation closes the panel and changes
  the address. Invisible to every component test, because jsdom has no top layer.
- **Eleven requirements are absences**, gathered in `apps/api/tests/unit/qa-absences.test.ts` and
  `apps/web/tests/unit/qa-absences.test.ts`: no edit route, no downvote or reaction, no voter
  disclosure, no answer/pin/moderation route, no Home card, no destination, no de-duplication,
  nothing that polls, no contact derived from a question, no bell, no column on the attendee
  record. **Both guards strip comments before matching**, because every pattern also appears in
  the prose explaining the absence — matching raw text fails on a correct implementation, and the
  natural repair is to weaken the pattern until it checks nothing.

**Deployment**

- **`deploy/vm/` is the whole platform**: Caddy with automatic Let's Encrypt TLS serving the built
  client and reverse-proxying `/api/*`, an API container, and a **loopback-only** PostgreSQL
  container. `deploy/vm/README.md` is the operator runbook; read section 6 before rolling back.
- **`/ready` is what a deployment gates on**; `/health` is deliberately unchanged. A container with
  an unreachable database answers `/health` perfectly and every attendee request with a failure.

## Standing decisions (project owner)

Decided explicitly. **Not open for re-inference.**

**2026-08-04**

1. **The product is MyNet.** Not EventLink.
2. **MyNet is the real product, not a demo.** The front-end-demo framing is withdrawn.
3. **`requirements.md` is authoritative for WHAT, not HOW.**
4. **Durable persistence is foundational** — a project-owned API over PostgreSQL. *Amended in
   v3.0.0*: originally "managed PostgreSQL"; see decision 17.
5. **Real authentication is foundational**, not a later addition.
6. **The five destinations are individually addressable.**

**2026-08-06**

7. **Event scoping is hybrid.** Conference content — sessions, tracks, speakers, the Discover
   directory, appointments — is per-event and swaps on switch. Relationships — contacts, exchanged
   cards, message threads — persist across events. **Every new table declares which rule applies and
   why; neither is a default.**
8. **Conference content is seeded; profiles are attendee-authored.** Each attendee authors their own
   profile and no one else's.
9. **Home is composed, not aggregated.** Independent cards, each owning its loading, empty and
   failure states. A failing card must not blank the dashboard; no card depends on another.
10. **Features run mostly sequentially**, in parallel only where they touch disjoint files.

**2026-08-07** (ratified in constitution v2.3.0)

11. **A person becomes an attendee by signing themselves up** — email, display name, password, plus
    an access code carried on the seeded event row. This does **not** breach the organizer
    exclusion, and the reasoning is not to be re-derived: *event invitation* and
    *organizer-provisioned* both need an issuer who is not an actor here, and *ticket holder* needs
    an undecided integration. Self sign-up is the only model leaving the attendee as sole actor.
    Password recovery is consequently in scope.
12. **Retention, deletion and export are self-serve and complete.** Hard deletion with cascade, no
    tombstone; machine-readable export covering every field collected; a retention clock for
    records no cascade can reach. Built to the strict standard so settling jurisdiction is not a
    precondition.
13. **Attendee avatars are uploaded.** Resizing and **EXIF stripping are mandatory** — phone
    photographs carry GPS coordinates. The prototype's Unsplash photographs are of real people and
    must not ship as seeded attendee faces.
14. **Transactional account mail is in scope** — verification and password reset, and nothing else —
    distinct from the excluded engagement notifications.
15. **Image bytes go through a `StorageService`** platform interface, never a storage SDK in feature
    code. A lint rule keeps vendors and the backing table inside `apps/api/src/storage/`.
16. **A profile is visible to co-attendees at the same event**, with one discoverability toggle.
    All-or-nothing by design; per-field permissions were considered and rejected.

**2026-08-07** (ratified in constitution v3.0.0) — these supersede earlier statements:

17. **The database is provisioned by this project, not a vendor.** Only *who operates it* changes;
    the engine, project-owned contract, reviewed migrations and repository-interface access are
    unchanged. **Backups become a governance obligation**: at least daily, automated, a written
    retention period, and a restore actually performed before production holds real attendee data.
18. **Production and UAT are two isolated Azure VMs**, each with its own host, database, secrets and
    address.
19. **Client and API share one origin.** Not a preference: it is what keeps `SameSite=Lax` a genuine
    CSRF defence and makes `connect-src 'self'` literally true. **The configuration it replaced
    could not sign anyone in** — `fly.dev` and `pages.dev` are separate registrable domains on the
    Public Suffix List, so the cookie was never sent.
20. **Per-change preview deployments are withdrawn**, and with them **001's shipped FR-066 and
    SC-011** — the first delivered requirement this project has retracted, which is why v3.0.0 is a
    major version. A change reaches UAT on merge to `develop`. **001's FR-067 survives**: no
    non-production environment may be connected to real attendee data, and that now binds UAT.

**2026-08-08** (ratified in constitution v3.1.0):

21. **Engagement notification delivery is in scope, for a received message and nothing else.**
    Reverses the exclusion that has stood since 1.0.0. Three things survive unchanged and are what
    keep it narrow: **the bell and an in-app notification centre stay forbidden**; a received
    message is the *only* trigger, so a second one needs another amendment; and permission is
    deniable, so an attendee who refuses gets a complete product rather than a degraded one.
    Accepted and **not** solved: message content appears on a lock screen, and whether an attendee
    may suppress it was not decided.
22. **`VisibilityService` is a seventh device capability.** Added by an implementation rather than a
    product decision: a poll must stop while the tab is hidden, and the only way to ask is a browser
    API feature code may not call. The alternative was a lint exemption, which would have traded a
    structural boundary for a poll interval.
23. **A report leaves the product as operator mail and is readable from nowhere inside it.**
    Reporting blocks in the same action; the mail carries identifiers and a timestamp, never message
    text and never the reason; and a failed dispatch fails neither the block nor the record. **The
    address is not decided** — it is an obligation the owner personally holds, because somebody has
    to read that inbox.

**2026-08-10** (ratified in constitution v3.2.0) — **these closed the last register entries blocking
a queued phase**:

24. **A contact is someone whose digital business card you hold.** No connect verb, no accept step —
    neither appears in `requirements.md` or the prototype. **Contacts must never be derived from
    conversations**: 007's open send made a conversation unilateral, so deriving them would let a
    stranger insert themselves into another attendee's Network by sending one message. *Closes
    register entry 7.*
25. **Card sharing is one-directional, and records the exchange rather than the person.** It gives
    the recipient your card and gives you nothing; you hold theirs when they share back. The stored
    row is sharer, recipient, instant, and the event it happened at. A held card **resolves the
    sharer's live profile**, under a **standing consent that outlives the event and the
    discoverability toggle** — so resolution bypasses the directory's discoverability condition and
    must never consult verification state. A card cannot be recalled; blocking severs it both ways
    and also prevents scheduling. *Closes register entry 8.* Two things bind alongside it:
    **appointments are proposed, then accepted or declined** (a deliberate asymmetry — an
    appointment claims a slot of someone's time, which a message and a card do not), and **slot
    availability must disclose nothing about the invitee**, which forbids deriving slots from their
    saved sessions or auto-declining on their conflicts as a leak by omission.
26. **Audience questions are attributed to their author.** Q&A is therefore a personal-data surface
    under Principle VIII, carrying identity scoping, deletion cascade and export coverage. *Closes
    register entry 9.* **Not solved**: what happens to a departing attendee's question that other
    people have upvoted — 007's answer for conversations does not transfer, and 009 must decide it.

**2026-08-10** (ratified in constitution v3.3.0) — **the amendment that gated 009's first line of
code**:

27. **Public Q&A visibility is a recorded exception to "private content stays private", and it is
    the SECOND one rather than the third.** A question is visible to every attendee registered
    for the event, under a real name, **with no opt-out**, specifically including an attendee who
    has turned discoverability off. Principle VIII requires an exception to be *recorded* rather
    than derived, and the entailment argument — that attribution (N3) already implies public
    visibility — was available and deliberately not taken. **The count was corrected at
    ratification**: 009's artifacts called it the third, counting v3.2.0's N2, but N2 bypasses the
    **discoverability toggle** under a standing consent and is not an exception to private
    content at all. Three consequences travel with it: verification is never consulted, the name
    is attribution rather than a route into the profile, and the attendee is told before they
    publish.
28. **A departing attendee's questions go, and everybody's votes on them go with them.** This is
    the problem v3.2.0 left explicitly open for 009. Nothing survives de-attributed — no
    placeholder, no "deleted attendee", no tombstone. The cost is stated rather than hidden:
    other attendees lose a question they backed. It is accepted because the alternative is
    retaining one person's words after they exercised erasure, on the strength of other people's
    interest in them.
29. **FR-756a is withdrawn.** A refused Q&A action does not purge the conference cache. Meeting it
    would have given one feature a cross-feature responsibility **no other undecorated repository
    has** — Messages, Discover, cards and profile all refuse without purging, and have since they
    shipped. The underlying gap is real, product-wide and older than 009: **a cached conference
    can outlive a withdrawn registration by up to 24 hours.** It is **register entry 22**, against
    010, rather than 009's to fix alone.

**Sharpened at the same time, without reversing anything**: standing decision 16 now says
explicitly that there is **one visibility decision per attendee** and that no feature may give an
individual field its own audience. 008 had specified a contact line carried only by a shared card;
the owner rejected that reading and the field was withdrawn before any migration was written.

**2026-08-10** (ratified in constitution **v3.4.0**) — **this closed the oldest entry in the
register**. *Two corrections made 2026-08-11: this block cited v3.3.0, which is the Q&A amendment
above, and it numbered its decision 27, which the Q&A block already used. The brand mark is decision
**30**.*

30. **MyNet has a brand mark, and the owner's board is its single source.** Supplied 2026-08-10: a
    continuous round-capped "N" with two node terminals, in coral on navy and navy on cream, with
    both lockups and 32/24/16px scale tests. *Closes register entry 2*, open since 1.0.0 — it
    needed an asset only the client could provide, which is why nothing here could close it sooner
    and why no mark was ever drawn in the meantime. Four things bind alongside it:
    **assets are derived by a readable script**, never committed as opaque binaries, so a reviewer
    verifies crop geometry and plate colour by reading code and the later vector redraw is a change
    of *input* to one pipeline; **the icon plate carries the brand's navy `#0d1942`, not
    `navy-800`** — measured, not preferred, because the board has no alpha channel so the mark's
    antialiased edges are blends against its own navy and any other plate leaves a halo; **the mark
    ships as an image beside live text**, never as a raster lockup, and never replacing an
    accessible name; and **a declared icon with no file fails the build**, because a manifest can
    name a missing file while all ten gates pass and the failure appears only on a real device.
    **Deliberately not decided**: whether `navy-800` and `coral-500` adopt the brand values — that
    is new register entry 22, and the resulting seam between the icon plate and the token-derived
    `theme_color` is knowingly accepted. **Deliberately not closed**: register entry 4, the
    unvalidated desktop and tablet layouts, which this work *escalates* by putting a mark in both.

**2026-08-11** (ratified in constitution **v4.0.0**) — **the amendment that reverses the oldest
prohibition in this document, and the first to introduce a second actor**:

31. **Administration enters product scope; payment processing does not move.** The two were named in
    one sentence in Principle III and were never one decision. This is the second time this project
    has retracted delivered requirements — after v3.0.0 withdrew 001's FR-066 — and it is MAJOR for
    that reason plus two others: Principle III's *"the attendee is the only actor in scope"* is
    redefined, and the prohibition that Principle III and decision 8's seed clause each named an
    amendment as the precondition for is lifted. **The reversal was forced rather than sought**:
    register entry 19 (nobody moderates an avatar) and entry 21 (the reporting dialog promises a
    human reader) had both been traced in writing to this exclusion, and 009 recorded that a public
    Q&A surface "needs a moderator, and a moderator is an organizer — the actor Principle III
    excludes by construction". An exclusion whose cost is an unkeepable safety promise must be paid
    for or reversed.
32. **A second actor exists, in two tiers, and neither is reachable by self sign-up.** A **platform
    operator** is seeded as committed reviewed data, holds product-wide authority, and is the only
    tier that may promote an attendee or read the report queue. A **conference organizer** is an
    attendee promoted by a platform operator, whose authority reaches only conferences they are
    assigned. The no-self-sign-up rule is load-bearing and is **the mirror of decision 11**: self
    sign-up was mandatory for attendees because it was the only model leaving the attendee sole
    actor, and it is forbidden here because anyone who can sign themselves up as an administrator is
    not one. A tier reachable by self sign-up is a privilege escalation with a form.
33. **Administration is a separate website** against the same API and database. **MyNet gains no
    admin surface, no privileged view, and no role-dependent rendering**, and that must be testable
    as an absence rather than asserted in prose. This is what keeps Principle III's
    attendee-workspace framing true while its actor clause changes, and it is why the amendment is
    smaller than the prohibition it reverses. A promoted organizer's *attendee* experience must be
    unchanged in every observable way. **No administrative tier may edit anybody's profile** —
    conference content is authorable, a person is not.
34. **The seed remains the dev and test fixture, and there is one class of conference.** A seeded
    conference is an ordinary editable conference: no privileged content, no immutable content, no
    control that renders for a conference it cannot act on. A reviewed change to committed seed data
    stays a valid route and stops being the only one. The seed's fixture properties are load-bearing
    and must survive: `assertDisjoint`'s two-disjoint-programmes guarantee, and the deliberately
    empty third conference that exists so the "no programme" state cannot rot.
35. **A platform operator may read reports; FR-548 survives for MyNet.** The original rule rested on
    "a report-reading surface needs a moderator, and a moderator is an organizer — the actor
    Principle III excludes by construction", and that actor now exists. Three conditions bind it:
    only the platform tier (a conference organizer must not read reports); the reporter is still
    promised nothing, so a queue must not become a status they can see; and **what the queue may
    disclose is register entry 24 and is NOT decided** — the operator-mail floor (identifiers and a
    timestamp, never message text, never the reason) holds until it is. A queue showing reported
    message text would need a **third** recorded exception under Principle VIII.
36. **Delivery is three features behind one amendment** — 011 (administrative foundation and the
    report queue), 012 (conference content authoring), 013 (registration and attendee management).
    **011 reserves migration `0009`.** One amendment rather than three, because the second actor is a
    single decision and splitting it would let it drift. **Moderation ships first, not authoring**,
    though authoring is what prompted the work: it is the smallest subsystem, so it proves the new
    architecture where being wrong costs least, and reports are already arriving from 007 and 009
    with nowhere to go.

**Five code-level guards enforce the reversed prohibition and must each be amended deliberately**,
never weakened until they stop checking anything: `apps/api/src/db/seed/catalog.ts` (its header
asserts no write path and no import path at any privilege), `catalog-read-only.test.ts` (FR-191),
`join-grants-nothing.test.ts` (FR-132, FR-134, FR-311), `qa-absences.test.ts` (no moderation route),
and `no-report-read-surface.test.ts` (FR-548, which survives for MyNet).

**2026-08-11** (ratified in constitution **v4.1.0**) — **closes all three entries v4.0.0 opened, in
the same session. Feature 011 is unblocked:**

37. **The administrative site is a subdomain, and its operator holds a separate session.**
    `admin.<host>`, with `/api/*` reverse-proxied under it so its calls stay same-origin, and a
    **host-only** session cookie — so one person signed into both products holds **two independent
    sessions**, and signing out of one does not sign out of the other. *Closes register entry 26.*
    **The reasoning turns on a distinction that must not be re-derived carelessly**: `SameSite` is
    evaluated against the **registrable domain, not the origin**, so a subdomain is *same-site*
    (decision 19's CSRF defence survives untouched, no synchroniser token needed) **and**
    *different-origin* (its own service-worker scope, storage and CSP). No other topology gives
    both. A path shares the origin and the attendee service worker is registered at **root scope**,
    so it would intercept admin navigations. A separate registrable domain stops `SameSite=Lax`
    being sent — the exact v3.0.0 failure where the cookie was never sent and nobody could sign in.
38. **The report queue discloses the reported content and the reporter's stated reason**, to
    platform operators only. *Closes register entry 24.* **This is the THIRD recorded Principle VIII
    exception** — v4.0.0 predicted it would be one and refused to grant it by inference, which is
    the point. Four conditions bind: platform tier only (a conference organizer may not read reports
    at all); only what was reported, never the surrounding thread; only in the queue; and the
    reporter is still told nothing. The **operator mail is unchanged** — identifiers and a timestamp
    only — because it was written that way to stop the text living in an inbox outside every
    retention rule this project controls, and a queue reading the row is not that.
    **`content unavailable` is a first-class state, not an error**: reported message ids are stored
    as a plain array rather than a foreign key precisely because the messages are usually gone
    before anyone looks.
39. **An organizer's assignments end with their access.** Deleting an account revokes that person's
    organizer assignments **in the same transaction**, and withdrawing from a conference revokes the
    assignment for it — 008's precedent, because **authority must not outlive the access it depends
    on**. *Closes register entry 25.* **Deletion is never conditional**: decision 12 holds
    absolutely and no administrative role may make an attendee's erasure right depend on another
    person existing. A conference left with no organizer enters an explicit **`unassigned`** state
    that platform operators can see; the conference and its content survive untouched, because
    conference content is not attendee data. Reverting ownership silently to the platform tier was
    rejected — it is a tidier invariant that hides the event nobody is prompted to act on.

## How work is done here

### Branching and change flow

`main` and `develop` are protected. **Never commit or push directly to either.** Every change goes
through a pull request.

- Branch from `develop`, named `<type>/<short-description>` (`feat`, `fix`, `chore`, `docs`,
  `spec`, `refactor`).
- Open the PR against `develop`; merge with **squash** and delete the branch.
- Promoting `develop` → `main` is also a PR.

Activate the local guardrails once per clone: `git config core.hooksPath .githooks`.
`.githooks/pre-commit` and `pre-push` block direct commits and pushes to `main` and `develop`. They
are bypassable with `--no-verify`, and **server-side branch protection is not configured** — see
open questions.

### Constraints

- **Attendee data is personal data.** Every record is attributable to one identity; every read path
  is scoped by identity; authorization is server-side, never client-side filtering. Secrets never
  reach the client bundle. (Constitution Principle VIII.)
- **Deletion and export are per-feature duties.** Every feature storing attendee data declares how
  its records are covered, in the change that introduces them.
- **Data access goes through repository interfaces.** Components never call the network or know
  transport details. (Principle V.)
- **Every feature declares its own completeness** (Principle IX): offline behaviour, all three
  layouts, empty/loading/failure states, accessibility, checklist items discharged, identity
  scoping, event scoping, register position, reserved migration number — declared in the spec, or
  presumed unmet. **None may be deferred to a later polish pass.** The section is called *Feature
  Declarations*, and as of 2026-08-11 it is **finally in `.specify/templates/spec-template.md`** —
  it had been mandatory since v2.1.0 and hand-copied into every spec from 002 to 010, because the
  template never carried it despite the roadmap saying it did. Draft v4.0.0 adds a first row,
  **Actor and tier**: every feature through 010 had one actor and never had to say so.
- **Out of product scope**: payment processing. **Organizer administration came IN at v4.0.0**
  (standing decisions 31–36), under four binding conditions — a separate product, a second actor in
  two tiers, no self sign-up into either, and no admin surface in MyNet. An administrative
  capability failing any one of those is outside the reversal and needs its own amendment.
  **Calendar integration**
  stays out until a recorded decision brings it in — its interface exists but must not be wired.
  **Engagement notification delivery came IN at v3.1.0** (standing decision 21), bounded to a
  received message and nothing else; **the notification bell and an in-app notification centre
  remain forbidden**, and that half of the old exclusion is unchanged.
- Loading and failure states are required wherever data crosses the network.
- Every interactive control has an accessible label, a visible focus state, and keyboard support.
  Modals need a clear close action and Escape handling.
- **Responsive**: desktop = persistent left rail, contextual top bar, multi-column dashboard;
  tablet = reduced rail, two-column cards, stacked detail; mobile = compact header, bottom
  navigation, single-column cards, full-width overlays, touch-sized controls. **No content or
  primary action may require horizontal scrolling.**
- **Required empty/error states**: no attendee search results (message + reset-filter action), no
  saved sessions (invitation to explore), empty thread (conversation-starter prompt), no meeting
  slots (explanation + close), invalid empty message or meeting topic (**disabled confirmation**,
  never a post-submit error).
- **Visual direction**: editorial conference aesthetic — deep navy surfaces, warm coral accents,
  soft cream backgrounds, white content cards, subtle mint status cues. Confident contemporary
  typography, restrained rounded corners, purposeful shadows. Must not read as a generic enterprise
  dashboard; people, sessions and time are the strongest visual elements.
- **Whole-product validation checklist**, satisfied incrementally: production build, desktop and
  mobile rendering, navigation and event switching, search/filter, session save + notes + Q&A,
  message composition, card-sharing feedback, meeting scheduling, keyboard focus visibility and
  accessible labels. Each feature states which items it discharges.

### Reading `requirements.md`: WHAT binds, HOW does not

| **WHAT — binding** | **HOW — superseded** |
|---|---|
| Actors, capabilities, five destinations, workflows | "single-route, front-end product demo" |
| Domain terminology and visual direction | "without external services, authentication, or durable storage" |
| Accessibility and responsive obligations | "data live in focused in-file constants" |
| Required empty and error states | "No network request is required" |
| The core journey and success criteria | "Browser reloads reset state, which is acceptable" |
| Product exclusions (organizer admin, payments) | "Not included: persistent databases, real authentication" |

### Technology stack

- **Client**: React + TypeScript as an installable PWA — manifest, icons, offline shell, versioned
  caching, explicit online/offline states. Offline behaviour is specified **per feature**.
  Optimistic updates and conflict resolution each require a recorded decision.
- **Backend**: project-owned API over **PostgreSQL**; the contract belongs to this project, not a
  vendor. Chosen over a managed BaaS for portability and contract control; the operational cost is
  accepted.
- **Authentication**: real, server-side session establishment and validation. Self-owned versus
  delegated is undecided.
- **Abstraction layers, both mandatory.** Device capabilities — `NotificationService`,
  `CalendarService`, `CameraService`, `ContactShareService`, `SecureStorage`,
  `ConnectivityService` — plus `StorageService`. Data access — repository interfaces in domain
  terms. Application code calls neither browser APIs nor the network directly.
- **Linux-based CI**, no Apple infrastructure: typecheck, lint, unit, component, contract,
  migration verification, integration against a real database, accessibility, e2e, production
  build. All ten correctness gates run, against per-job `postgres:17` service containers.
- **Add Capacitor only when** App Store distribution becomes mandatory, a required capability is
  inadequate on the web platform, or field testing shows PWA installation materially harms
  adoption. Then Codemagic/Bitrise, TestFlight, Play internal testing.
- **Test on at least one physical iPhone before production.**
- Ranked alternatives if the stack is revisited: React + Capacitor → React Native + Expo → Flutter
  → .NET MAUI (only for a strongly C#/.NET team). Xamarin and Unity are not recommended.

### Role of the prototype

`GroundZero/prototype/` is an **approved visual and interaction reference, not production code.**
It is a Figma Make export: one 1,400-line `App.tsx`, all state in root `useState`, hardcoded hex
colors, hand-inlined SVG icons, an unused shadcn scaffold, and a dependency list the app does not
use. Its architecture and code quality carry **no authority** and should not be preserved.

Use it for: interaction flows, screen composition, copy, sample data shape, visual language.

Two things it gets wrong that are **settled requirements, not open questions**: it implements
neither Escape handling nor visible focus states (Principle IV settles this — a defect to fix), and
it hardcodes a persona and date ("Good morning, Sarah", "Tuesday, March 18") that real auth and
real data replace.

## Open questions

**Do not silently resolve any of these.** The authoritative register is in the constitution; this
is a working summary. Each names what it blocks, because *when* to ask matters as much as what.

### Require a client decision

**No open question blocks any feature, including 011.** *As of 2026-08-11.* v4.0.0 opened a second
programme (011, 012, 013) and with it entries 24, 25 and 26; **v4.1.0 closed all three in the same
session**, so the blockers existed for one exchange rather than one release. Everything below blocks
**deployment** or **release**, not code.

The closing sequence is worth keeping, because it is the argument for opening entries you cannot yet
answer: those three produced a **third privacy exception**, a **CSRF-adjacent topology decision**,
and a **deletion rule touching decision 12**. None is a spec detail, and all three would have been
settled by inference inside a feature specification had they not been opened deliberately.

Also closed: v3.2.0 settled the connection model, card-exchange semantics and Q&A attribution;
**v3.3.0** public Q&A visibility and the withdrawal of FR-756a; **v3.4.0** the oldest entry of all,
the brand mark.

- ~~**Register entries 24, 25 and 26**~~ — **RESOLVED 2026-08-11 in v4.1.0** as standing decisions
  38, 39 and 37 respectively. See the decisions above; they are now binding text rather than
  questions.

- **Register entries 19 and 21 are ADDRESSED but NOT closed — by v4.0.0 or v4.1.0.** 011 creates the
  first actor capable of moderating an avatar and of reading a report queue, and v4.1.0 decided what
  that operator may *see* — but **a capability is not a policy**. Who moderates, against what
  standard, on whose complaint, with what appeal, and whether a removed avatar is replaced or
  blanked are all undecided (19); and somebody still has to *be* that operator, which remains an
  obligation the owner personally holds (21). Neither may be read as closed by 011 shipping.
  **These two are the oldest live entries in the register**, and they are the reason the
  administration exclusion was reversed at all.

- **Register entry 22 — a cached conference can outlive a withdrawn registration by up to 24
  hours.** Conceded by 009 when FR-756a was withdrawn, and **product-wide rather than 009's**: no
  undecorated repository — Messages, Discover, cards, profile or Q&A — purges on refusal. It was
  filed against 010, which did not answer it: 010 adds no repository and no cached read, so the
  single answer that covers all of them is still owed.

- **Desktop and tablet layouts are unvalidated.** The approved prototype is mobile-only — a fixed
  390×844 frame. Every desktop layout built before this is answered is unreviewed design, so the
  cost compounds with each feature. **008 turned this from a risk into an observed defect**: the
  first dialog a human looked at was rendering in the top-left corner, having passed every gate.
- **Whether a question's payload should carry `authorId`** — raised at 009's deep-review gate.
  It makes Q&A the **first surface handing a co-attendee the identifier of somebody who has turned
  discoverability off**, and `GET /blocks` then resolves that identifier to a live display name
  **and avatar bytes** with no discoverability condition, indefinitely. The profile route still
  refuses (FR-736 holds, and SC-707's two halves are now tested together); v3.3.0's exception is
  about the *name*, and the photograph is not the name. Both fixes contradict something written
  down — withdrawing `authorId` changes the interface `tasks.md` fixed, and narrowing `listBlocks`
  alters a 007 guarantee — so it is the owner's call. **Blocks nothing**: the product behaves as
  specified.
- **Whether proposing a meeting should require the invitee to be discoverable**, as sharing a card
  does. 008's deep review raised it; the spec's Assumptions say no, on the ground that holding
  somebody's card is the stronger predicate — they handed it to you. Recorded rather than resolved
  because changing it contradicts a written assumption, and that is the owner's call. **Blocks
  nothing**: the product behaves as specified today.
- ~~**Real brand mark and application icons.**~~ **ANSWERED 2026-08-10, ratified in v3.3.0, and
  now BUILT** — the owner supplied a brand board, closing the oldest entry in the register, and 010
  carried it into the product. Every icon on disk is derived from that board; the amber-banded
  placeholder and the script that drew it are deleted. What remains is a person looking at it on a
  phone (quickstart scenarios 5–9).
- **Whether `navy-800` and `coral-500` adopt the brand's values** (`#0d1942`, `#fe6551`) — new
  register entry 22, opened by the same amendment. Measured from the board, brand and tokens
  disagree on both; cream agrees. Adopting them makes the board the single source of truth for
  colour and removes the visible seam between the icon plate and the token-derived `theme_color` on
  the splash screen — but `navy-800` is the primary surface and `coral-500` is both the accent and
  the focus ring, so it repaints the whole product and every contrast ratio must be re-verified.
  **Blocks nothing**; 010 is explicitly forbidden from resolving it.
- **v3.1.0 is ratified and Phase 7 of 007 is delivered.** It resolved register entry 10 in part
  (delivery in, bell still out), added `VisibilityService` to Principle V, and made the reporting
  disposal path binding. **Two values it deliberately left open are below.** Neither blocks
  implementation — only delivery in a deployed environment, and `deploy/vm/.env.example` documents
  both with what a blank value costs.
- **VAPID key custody** — register entry 20. **The entry is worded as "the push provider", and that
  half turned out not to exist**: Web Push signs with your own key pair and posts to whatever
  endpoint the browser issued, with no account, SDK or third party involved. The constitution's
  wording is unchanged and should probably be amended. What remains genuinely open is custody: who
  holds the private key, where it lives per environment, and what happens on rotation — since
  rotating it silently stops delivery for every attendee until their browser re-registers.
- **The operator address abuse reports are sent to** — register entry 21. Not a vendor question but
  an obligation the owner personally holds: the reporting dialog says a person will read it, and
  that sentence is only true once somebody does. Until then a report still blocks and still records,
  and the skipped dispatch is logged rather than dropped.
- **Whether `requirements.md` is amended** or its divergence from the constitution simply recorded.
- **What "PS" denotes** in `mynet-ps`.

### Require an owner or planning decision

- **No domain is registered and no Azure subscription is named**, so nothing has been deployed.
  Caddy cannot obtain a certificate without a resolving A record. `deploy-uat` and `deploy-prod`
  exist and are wired, but **print what they are blocked on and exit 0** rather than failing every
  merge. `deploy/vm/OPERATIONS-LOG.md` records the restore that *has* been exercised — locally,
  against a throwaway container — and the half that cannot yet be. **Blocks production readiness.**
- **UAT access control.** UAT is publicly reachable, permanent, and carries realistically-shaped
  attendee data. The data-separation half is settled and binding (FR-067: the tooling must *refuse*
  to point UAT at production data, not merely be configured not to). Who may reach it is not.
- **Authentication ownership** — self-implemented versus a delegated provider.
- **The transactional email provider.** v2.3.0 settled that account mail is sent, not by whom.
  Brings one external dependency and one secret.
- **Nobody moderates uploaded avatar images.** Public self sign-up plus image upload, in a product
  with no administrative actor by construction — and the organizer exclusion forecloses the usual
  answer. Cheapest to settle before the first publicly reachable environment.
- **Server-side branch protection is unconfigured** — a configuration task, not a limitation. The
  protection endpoints return **404 (no rule set)**, and protection is free on public repositories.
  Enforcement is meanwhile client-side and bypassable, which is material now that real attendee
  data is in scope.
- **The repository is public**, and this went unrecorded until 2026-08-07. It changes the Principle
  VIII threat model: seed data, migrations, workflow config and the API contract are world-readable.

### Known unclaimed defects

`specs/004-attendee-identity-and-profile/review-findings.md` records 37 findings — 21 fixed, ten
Minor deliberately left open with stated reasons. **Two are real and unclaimed**: neither token
table has an index on `attendee_id` (Postgres does not create one for a foreign key, so every
account deletion cascade-scans both), and migration `0003` rewrites `events` under a volatile
default with no `lock_timeout`. Both need **deliberate** work, because the fix requires regenerating
the Drizzle snapshot — exactly what the migration README warns against doing casually.
