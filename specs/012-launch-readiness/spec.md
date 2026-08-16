# Feature Specification: 012 — Launch Readiness

**Feature Branch**: `spec/012-launch-readiness`
**Created**: 2026-08-16
**Status**: Draft (revised after spec review)
**Constitution**: v5.4.0 (ratified 2026-08-15)
**Brainstorm**: `brainstorm/14-launch-readiness.md`

## Departure from the roadmap, declared

The delivery roadmap names 012 **"Launch Readiness and Production"**. **This feature delivers only
the first half. The production deploy splits into its own phase.**

`deploy/vm/envs/prod.env` carries `SUBSCRIPTION=` and `APP_DOMAIN=` blank, and that is standing
decision 31 working exactly as written: `mynetcr.com` was named *provisionally*, and committing it
before registration is forbidden **because a blank value is what keeps the deploy job's refusal
honest**. The owner reports registration as weeks away or uncertain. A feature carrying production
would therefore sit blocked on something outside this repository, holding a completed validation
pass hostage to a domain purchase.

Constitution governance requires a feature departing from the roadmap to say so in its
specification. This is that statement, following 002's precedent when it absorbed 003. **FR-1150
carries the reciprocal obligation**: the roadmap's own table must be annotated in this change, on
v5.3.0 decision 53's reasoning — a feature reading the roadmap must not find a row that contradicts
the specification.

**The production phase takes no number here.** Reserving one would repeat the mistake decision 53
corrected for migrations: reserve-in-advance collided three times because branches cannot see each
other's reservations.

**One constraint the production phase inherits and must not lose**: UAT and production MUST remain
separate *registrable* domains (decision 31). That is what makes a UAT session cookie structurally
incapable of reaching production, and it was arrived at by accident of naming rather than by design.

---

## User Scenarios & Testing *(mandatory)*

### The problem this feature exists to solve

Every feature since 001 that declared a by-hand walk has shipped with at least part of it
outstanding. **The exact inventory is FR-1111's first deliverable and is deliberately not asserted
here**, because the count is the thing most likely to be wrong: an earlier draft of this
specification counted `## Scenario` headings, which silently excluded
`specs/006-discover-and-deployment-platform/quickstart.md` entirely — it uses `### 2a`…`### 3e`
sub-headings instead — and 006 is the file carrying the *deployment* walk that was blocked when it
shipped.

What is known and verified:

- **122 by-hand scenarios exist across 13 features** — 109 numbered across twelve files, plus 006's
  13 lettered sub-scenarios.
- **Roughly 72 are outstanding by task status**, spanning at least 001, 006, 007, 008, 009, 010,
  011, 013, 014 (both tranches) and 016.
- **006's Part 3 was blocked on "there is no environment to deploy to"** (`tasks.md` T102). **011
  built that environment.** It has been walkable since and has not been walked.
- **011's own T084 says "all nine scenarios" and records that "007, 008 and 009 each shipped with
  this outstanding"** — it knew it was joining the backlog.
- **001's T093 is open**: verify every gate by deliberately breaking it, *"a gate that does not fail
  when broken is not a gate"*. That principle is borrowed by FR-1127 below.

This is the largest undischarged obligation in the project and the only part no machine can do.

**The evidence that it matters is not theoretical.** The only two defects a human has ever found in
this product were both **layout**, both found within minutes of somebody opening a screen, and both
had passed every automated gate:

- 008's scheduling dialog rendered in the **top-left corner of the viewport**, having passed 135
  end-to-end tests, five review agents and CodeRabbit.
- 010's top bar truncated the product name to **"M…"** at every mobile width — and had been doing so
  since before that feature existed.

And **016 exists as a feature only because the owner used the deployed product and found six
things.** The pattern is consistent: real use finds what gates cannot.

**Constitution v5.4.0 added a fresh reason to look.** Its decision 56 (R3) closed register entry 4 by
**owner ratification without a client acceptance act** — the desktop and tablet layouts are now
ratified as intended and **nobody has seen them**. R3 records that cost in the constitution itself.

### US1 — The attendee journey, walked end to end (Priority: P1)

A person signs up, joins a conference by code, and arrives at the conference happening now. They
inspect what is next, save sessions, discover an attendee, exchange a card, open a conversation,
schedule a meeting, ask a question, enrol in an optional session, and read it all again offline.

**Acceptance scenarios**:
1. **Given** a signed-out visitor, **When** they complete sign-up, verification and join-by-code,
   **Then** they arrive at the conference happening now, greeted by name and told which day it is in
   the venue's timezone.
2. **Given** an attendee on the conference, **When** they walk all five destinations in one session,
   **Then** every destination renders its content and its empty state where applicable, and no
   control requires horizontal scrolling at any tested width.
3. **Given** two attendees in two browser profiles, **When** one shares a card, **Then** both hold
   the other's card (the mutual exchange C1 ratified), and both see it in Network.
4. **Given** an attendee with saved sessions, notes and a meeting, **When** the device goes offline,
   **Then** each cached surface renders with a retrieval stamp and each uncached surface refuses
   honestly.

### US2 — The organizer journey, walked end to end (Priority: P1)

A promoted attendee signs into the administrative site, authors a conference, adds tracks, rooms,
speakers and sessions, marks one optional with capacity, watches enrolment fill, cancels a session,
and confirms the attendee side reflects every change.

**Acceptance scenarios**:
1. **Given** an operator credential, **When** an organizer is promoted and signs in, **Then** their
   *attendee* experience is unchanged in every observable way (FR-970–FR-984).
2. **Given** an authored session an attendee has saved, **When** its room or start time changes,
   **Then** that attendee receives **one** notification and sees the marker on that row — and no
   view in either product presents a count of changes.
3. **Given** an optional session at capacity, **When** a further attendee attempts to enrol,
   **Then** the refusal says the session is **full**, which is a different sentence from **closed**.

### US3 — The operator journey, walked end to end (Priority: P2)

A platform operator signs in, promotes and demotes an organizer, reads the report queue, resolves a
report, and confirms that no route anywhere lets them act on a person.

**Acceptance scenarios**:
1. **Given** a seeded operator identity with no credential, **When** a credential is issued,
   **Then** the operator can sign in at `admin.<host>` and **no attendee record is destroyed**
   (SC-1210).
2. **Given** an operator signed into the administrative site and the same person signed into MyNet,
   **When** they sign out of one, **Then** the other session survives — two independent sessions
   (decision 37).
3. **Given** a report in the queue, **When** the operator opens it, **Then** the reported content
   and the reporter's stated reason are disclosed, `content unavailable` renders as a first-class
   state rather than an error, and the reporter is told nothing.
4. **Given** the administrative site, **When** every navigable surface is enumerated, **Then** no
   route suspends, removes, restricts or edits an attendee.

### US4 — The layout pass at every band, in both products (Priority: P1)

Every destination, panel and dialog is looked at on a phone, a tablet, and a desk — in **MyNet and
the administrative site**.

**Acceptance scenarios**:
1. **Given** each of MyNet's five destinations and each of the administrative site's surfaces,
   **When** viewed at 390, 768 and 1280, **Then** every primary action is reachable without
   horizontal scrolling, **measured per container** (SC-1204).
2. **Given** every modal dialog in both products, **When** opened at each width, **Then** it is
   centred with comparable space on either side — the 008 defect class, which no behavioural test
   could see.
3. **Given** the administrative site, **When** viewed across the supported range, **Then** it
   presents **three** distinct layouts, not two.
4. **Given** the 768–1279 band, **When** both products are compared, **Then** their rails differ —
   MyNet icon-only, administrative labelled — and **that difference is correct**, ratified by
   v5.4.0 R3. A finding that they should match is a decision under FR-1131, not a defect.

### US5 — The physical device pass (Priority: P1)

Install MyNet on a physical iPhone and a physical Android phone; judge the icon; drive
notifications; retype the composer test with a real keyboard.

**Acceptance scenarios**:
1. **Given** an uninstalled iPhone, **When** the attendee follows the guidance MyNet shows,
   **Then** installation completes using Safari's own affordance, and the sign-in screen explains
   what installing buys before it is installed.
2. **Given** an uninstalled Android phone, **When** the install control is offered, **Then** it is
   presented through `beforeinstallprompt` and installation completes.
3. **Given** both installed phones, **When** the home screen is photographed beside the in-app
   coral mark, **Then** the difference is recorded against register entry 28 (SC-1205).
4. **Given** an installed phone with notification permission granted, **When** an organizer changes
   a saved session's room, **Then** a notification is delivered to that phone and activating it
   lands on the surface carrying the per-row marker — not on a list of changes.
5. **Given** an installed phone, **When** a 40-word message is typed with the on-screen keyboard,
   **Then** the composer stays bounded and the send control is never occluded (016's T068).

### Edge Cases

- **The walker runs out of time mid-journey.** The record must show where the walk stopped, and an
  unfinished journey is not a passed journey.
- **A device refuses notification permission.** Denial is a complete outcome, not a degraded one
  (decision 21); the walk must confirm the product is unchanged, not merely that nothing crashed.
- **A defect is found in a surface 017 is scheduled to replace.** It is still a defect under
  FR-1130; whether it is worth fixing ahead of the rebuild is a decision under FR-1131.
- **The connection drops mid-walk.** That is a scenario, not an interruption — offline behaviour is
  under test.
- **A real account appears on UAT during the walk.** Public sign-up is open by design (decision 30);
  the walk continues and the occurrence is recorded, because it is evidence about FR-1100's
  durability.
- **A seeded defect (FR-1127) is found by an automated gate before the walker reaches it.** Then it
  was the wrong seed — it must be replaced with one no gate can see, which is the class the walk
  exists for.

---

## Requirements *(mandatory)*

### Unblocking the environment (prerequisite to everything else)

- **FR-1100**: UAT MUST be returned to the state standing decision 30 describes — **seeded data
  only**. The 4 genuine accounts recorded in `deploy/vm/OPERATIONS-LOG.md` are disposable.
- **FR-1101**: A platform operator credential MUST be obtainable on UAT.
- **FR-1102**: Obtaining an operator credential MUST NOT require destroying attendee data. The
  present coupling — `pnpm db:seed` is the only route to an operator row, and `attendeeSeed.clear`
  is unconditional with no module argument — MUST be removed.
- **FR-1102a**: The claim that separating the two commands means obtaining a credential does not
  require re-seeding is **false today, and it appears in FOUR places**: `apps/api/src/admin/
  bootstrap.ts`, `apps/api/src/db/seed/operators.ts`, `deploy/vm/README.md`, and
  `specs/013-administrative-foundation/quickstart.md`. **All four MUST be made true or corrected.**
  An earlier draft named only the first — repairing one and leaving three is precisely the 016
  FR-1052 failure this requirement invokes, committed by the requirement itself.
  `bootstrap.ts` additionally **cites the wrong requirement** — FR-902 is the organizer rule; the
  operator rule is FR-901 — and its test file inherited the error.
- **FR-1102b**: Two consequences of re-seeding are undocumented and MUST be recorded where an
  operator will read them: a re-seed **does** reset a committed operator's chosen credential (FR-993
  holds only for the *bootstrap command*), and a re-seed **destroys the administrative audit trail**
  and every organizer assignment.
- **FR-1103**: The re-seed and the credential issuance MUST be recorded in
  `deploy/vm/OPERATIONS-LOG.md`, including what was destroyed.

### The consolidated launch script

- **FR-1110**: A single launch script MUST be produced, organised by **journey** rather than by
  feature.
- **FR-1111**: The script MUST be derived from **every outstanding by-hand scenario in every
  `specs/*/quickstart.md`**, and the inventory MUST be produced by **enumerating the task files**,
  not by transcribing a list. The derivation MUST name every scenario it retires and where that
  scenario's coverage now lives. **A heading-shape assumption is what hid 006 from an earlier
  draft; the enumeration must not depend on one.**
- **FR-1112**: The script MUST cover the **seams between features** — steps crossing more than one
  feature's surface — because that is the entire justification for consolidating (SC-1211).
- **FR-1113**: The script MUST cover **both products**.
- **FR-1114**: The script MUST state, per step, what a *pass* looks like. A step whose outcome is
  "it looked fine" is not a step.

### The walk

- **FR-1120**: The script MUST be walked in full by a person.
- **FR-1120a**: The walk MUST be performed against the **deployed UAT environment**, on the build CI
  produced from `develop`, and the record MUST name the deployed commit. A walk against `localhost`
  exercises no TLS, no real push service, no deployed build and no UAT marker — and would make
  FR-1100 pointless.
- **FR-1121**: The walk MUST cover three widths in both products **on real viewports**. Emulated
  viewports are permitted only for a width no available device provides, and the record MUST name
  each emulated width and why.
- **FR-1122**: The walk MUST include a physical **iPhone** pass, discharging 016's T068.
- **FR-1123**: The walk MUST include a physical **Android** pass, covering what iOS structurally
  cannot: `beforeinstallprompt`, the install banner, and Web Push delivery.
- **FR-1124**: The walk MUST include a screen-reader pass over at least the five authentication
  screens and one representative destination in each product.
- **FR-1125**: Each walked step MUST be recorded as passed or failed **with an observation — what
  was actually on the screen — not a verdict alone. A step recorded only as "pass" is not
  recorded.**
- **FR-1126**: Every layout and install step MUST carry a **capture** — screenshot or photograph —
  at the width or device it names, stored with the record. **Layout is the one thing no verdict can
  convey and the one class of defect this walk exists to find.**
- **FR-1127**: The walk MUST be seeded with **at least three deliberately introduced defects** — one
  layout, one copy, one refusal message — introduced by somebody other than the walker, unknown to
  them, and revealed only after the walk. **A walk that misses any of them has established nothing
  and MUST be re-walked.** This is 001's own T093 principle — *a gate that does not fail when broken
  is not a gate* — applied to the human gate. A seed an automated gate catches first is the wrong
  seed and MUST be replaced.

### What the walk finds

- **FR-1130**: **Every defect found MUST be fixed.** The scope is unknowable in advance and that is
  accepted deliberately.
- **FR-1131**: A finding requiring a **decision** rather than a repair — a layout needing redesign,
  anything needing an amendment, anything adding a capability — MUST be **recorded as a decision and
  not silently fixed**. This feature ratifies nothing.
- **FR-1132**: Every fix MUST be traceable to the script step that found it.
- **FR-1133**: A defect fixed MUST have the step that found it re-walked.

### Pre-launch hygiene

- **FR-1140**: The `anonymous` cache entry — the one part of the cache **not scoped by attendee** —
  MUST NOT be able to serve one attendee's content to another. An **offline cold start presenting no
  credential** currently resolves the previous attendee from it, adopts their identifier as the
  cache scope, and serves their programme, saved sessions and **private notes**.
- **FR-1140a**: Comments asserting the superseded behaviour MUST be corrected in the same change —
  `services.ts`'s claim that the anonymous scope is *"a key nothing is ever written under while
  signed out"* sits in the block that writes one. **Searching for this requirement's number will
  find such comments only where the work was already done**, which is 016's FR-1052 lesson.
- **FR-1141**: The erasure's dependency on `listRegistered()` returning a **complete** enumeration
  MUST be made breakable rather than silent.
- **FR-1142**: A decision MUST be recorded on the **client diagnostic channel** (SC-1212).
- **FR-1143**: A decision MUST be recorded on **what happens to Q&A at launch** (SC-1212). Today's
  Q&A is unmoderated, attributed by full name, published instantly, and has **no feature flag**.
  **If the answer is to hide or gate it, that retracts delivered 009 requirements and requires a
  constitution amendment** — recording the decision is in scope; drafting the amendment and building
  the gate are not.
- **FR-1144**: Playwright MUST declare **WebKit and Firefox** projects alongside Chromium, and the
  responsive sweep MUST run in all three. Constitution v5.4.0 R3 names this work, assigns it to 012
  by name, and states it needs no client, no UAT and no decision.
- **FR-1145**: **Messages MUST load in WebKit.** Phase 0 measured it: `GET /conversations` is issued
  and never answered, so the destination sits at `Loading…` indefinitely with the shell rendered
  around it — **Safari users cannot open Messages**, and no gate has ever been able to see it.
  It cannot self-recover because `Messages.tsx` has **no first-load effect**; the initial read *is*
  the poll's first tick, so a stalled request has no error path. **This is a defect found by 012's
  own research and fixed under FR-1130** (owner decision, 2026-08-16). FR-1144 budgeted
  configuration and did not budget this.
- **FR-1146**: The two latent false-greens Phase 0 found MUST be fixed: both offline helpers wait on
  `navigator.serviceWorker?.controller !== null`, and on an engine without `serviceWorker`
  `undefined !== null` is **true**, so the wait resolves instantly; and the IndexedDB helpers
  resolve silently on error, so their assertions pass vacuously. **Both are wrong on Chromium too.**
- **FR-1147**: **Nine end-to-end tests have never run in CI** and MUST be brought in. The workflow
  derives its spec list with `ls e2e/*.spec.ts | grep -v 'accessibility\.spec\.ts$'`; the `$` anchor
  also excludes `admin-accessibility.spec.ts`, and the glob does not recurse, so
  `e2e/accessibility/identity.spec.ts` is matched by neither job. **The job count MUST stay at 10** —
  `verify` and `verify-push` hard-assert it and say in their own error text that it must not move
  without an amendment.
- **FR-1148**: **Backups on UAT MUST work, and a restore MUST be exercised on the real host.**
  `OPERATIONS-LOG.md` records that no backup has ever been taken there and `backup.sh` cannot run —
  `BACKUP_DIR` empty, no cron, `status` dying because an unquoted RFC 5322 `MAIL_FROM` has its
  `<`/`>` parsed as shell redirection, and `backups/` root-owned while the script runs as
  `azureuser`. **Standing decision 17 makes daily automated backups a governance obligation**, so
  this is a breach rather than a gap, and two walk scenarios (006/3d, 011/8) fail at step 1 without
  it.
- **FR-1149**: A session that **expires** MUST clear the resolved identity. Today `forget()` is
  called only on sign-out and account deletion, so an expired session leaves the scope resolved to
  the previous attendee — and a second person signing in in that same document has their identity
  written under the **first person's** cache prefix, where the first person's sign-out purge will
  never run.

### Record-keeping

- **FR-1150**: The roadmap's 012 row MUST be annotated with the production split and its reason, in
  this change. Decision 53's lesson generalises: a feature reading the roadmap must not find a row
  that contradicts the specification.

---

## Success Criteria *(mandatory)*

- **SC-1201**: A person can complete the entire attendee journey — sign-up to scheduled meeting — on
  a phone they own, without consulting the source code, working only from the script.
- **SC-1202**: **Every** by-hand scenario in **every** `specs/*/quickstart.md` is either walked or
  explicitly named as retired with its coverage relocated. **The inventory is produced by
  enumerating the specs, not by transcribing a list into this specification.** No scenario is left
  unaccounted for. **This criterion no longer says "whose feature task is not marked complete",
  because 002 and 004 have NO walk task at all** — 18 scenarios with nothing that could ever be
  marked, outstanding under the earlier wording's plain reading and invisible under its intended
  one. Phase 0 measured the corrected figures: **122 scenarios across 13 features, 74 outstanding
  walk units, 90 unaccounted.**
- **SC-1203**: Somebody who was not present can read the walk record and tell which steps passed,
  which failed, what was observed at each, and what was done about each failure.
- **SC-1204**: No content and no primary action requires horizontal scrolling at any tested width in
  either product, **measured at the level of each navigation and content container's own
  `scrollWidth` against its `clientWidth`, not at document level** — document-level overflow is zero
  by construction inside a scroll container and cannot see this defect class (v5.4.0 R3).
- **SC-1205**: The product is installable from a physical iPhone and a physical Android phone, and
  the owner records a judgement on the installed icon at home-screen size. **That judgement is
  recorded against register entry 28 and does not resolve it** (FR-1131); an adverse judgement is a
  decision, not a defect.
- **SC-1206**: A notification raised by a real organizer action arrives on a real phone and, when
  activated, lands on the surface carrying the per-row marker.
- **SC-1207**: On a device where a previous attendee used the product and did not sign out, opening
  the application **offline, presenting no credential**, discloses nothing belonging to them — no
  name, no email, no programme, no saved sessions, no notes.
- **SC-1208**: The number of defects found is known, the number remaining unfixed is **zero**
  (excluding findings recorded as decisions under FR-1131), **and every seeded defect under FR-1127
  was found by the walker.**
- **SC-1209**: UAT holds seeded data only, and a platform operator can sign in.
- **SC-1210**: A platform operator credential can be issued against a database **holding attendee
  records**, and the attendee row count is unchanged afterwards.
- **SC-1211**: The script contains steps that cross more than one feature's surface, each naming the
  features it joins, and no such step is a transcription of an existing scenario.
- **SC-1212**: The decisions required by FR-1142 and FR-1143 are recorded in a durable artifact, and
  the feature is not complete while either is unrecorded.

---

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Actor and tier** | All three, deliberately. US1 is the **attendee** in MyNet; US2 the **conference organizer** and US3 the **platform operator**, both in `apps/admin`; US4 and US5 cover both products. This feature adds no capability to any actor — it validates the ones that exist and repairs what the validation finds. |
| **Offline behaviour** | **CHANGED, deliberately, and this row was wrong in the first two drafts.** They declared it unchanged with "no new `passThrough` member" — which any fix closing SC-1207 falsifies, making the declaration an FR-1140a artifact in the specification that requirement lives in. What actually changes: **`getCurrent` stops being a cached read and becomes a declared `passThrough` member**, so an offline cold start can no longer resolve an identity from disk. **The cost is the offline cold start itself** — an installed PWA launch is a fresh document every time, so *"arrive at the venue with no signal, open MyNet, read the programme"* stops working. That degraded state is already built and already worded (`active-event.tsx`). No device capability is added. FR-1141 alters only *when* stored data is discarded. |
| **Desktop layout** | Unchanged by this feature and **reviewed by it for the first time**. v5.4.0 R3 ratified it without a client acceptance act; US4 is where a person finally looks. |
| **Tablet layout** | As above. The 768–1279 band is where the two products **deliberately diverge**, ratified as-is by R3. US4 scenario 4 pins that divergence as correct, so the walk cannot mistake it for a defect. |
| **Mobile layout** | As above, plus FR-1122/FR-1123's physical passes. `apps/admin`'s mobile layout was built days ago and no person has seen it. |
| **Empty / loading / failure states** | Unchanged. US1 scenario 2 requires every destination's empty state to be reached — the first time the "no programme" conference and the empty-thread prompt will have been seen by a person. |
| **Accessibility** | Unchanged; covered by FR-1124's screen-reader pass. Any control lacking an accessible label, visible focus or keyboard operability is a defect under FR-1130. |
| **Validation checklist discharged** | This feature discharges every remaining whole-product checklist item. **It is legitimate under Principle IX's verification clause and not the consolidated pass that principle forbids**: every obligation here was *declared and built* by its own feature, and this pass **verifies** it. Any obligation the walk finds was never built is that feature's undischarged debt, recorded as such under FR-1132; 012 fixing it does not retroactively discharge it. |
| **Identity scoping & server-side authorization** | Unchanged; no route added or altered. **FR-1140 strengthens it client-side**: the `anonymous` entry is the one part of the cache not scoped by attendee, and it is load-bearing for scoping, because a cache hit on it *sets* the scope. |
| **Deletion & export coverage** | **Not applicable, structurally: no table and no column is added.** Both coverage tests derive from the Drizzle schema, so there is nothing new to fail on. FR-1100's re-seed *destroys* attendee records, exercising the cascade rather than extending it. |
| **Event scoping** | **Not applicable: no new record is stored.** FR-1141 concerns erasure of *per-event* cached data, already per-event; FR-1140 concerns the *cross-attendee* bootstrap entry, scoped by attendee rather than event. |
| **Administrative counterpart** | **None**, and the obligation was examined on both axes. Attendee-side: FR-1140 and FR-1141 are device-local cache behaviour with no server surface, so there is nothing an administrator could see, undo or answer for. **Administrative side: FR-1101 and FR-1102 change how an administrative credential comes into existence** — the most administrative thing in this feature. No attendee-facing counterpart is needed, because an attendee cannot observe operator provisioning; it is recorded here rather than left to the attendee-side reasoning, which does not reach it. |
| **Register position** | **Blocks: none.** Entries 22 and 4 both blocked this feature; both closed by v5.4.0 on 2026-08-15 (R1, R3). **Resolves: none.** **Escalates: 19** — a walk putting real images before a person makes unmoderated avatars concrete rather than prospective; and **21** — FR-1101 issues a credential, which does not appoint a human to use it. **Opens: none at specification.** FR-1142 and FR-1143 each produce a decision; whether either becomes a numbered entry is the owner's act at the moment it is taken, and this feature does not number it. |
| **Migration number** | **No migration.** No schema change. Consistent with the roadmap's note that 012 adds none, and with `0010` remaining permanently unclaimed. |

---

## Assumptions

- **The 4 UAT accounts are disposable.** Stated by the owner. FR-1100 destroys them.
- **All four device classes are available** — iPhone, Android phone, tablet, desk machine. Stated by
  the owner; without any one, the corresponding requirement cannot be discharged.
- **Somebody other than the walker can seed FR-1127's defects.** If no second person exists, FR-1127
  cannot be satisfied as written and the substitute is a second person spot-checking 10% of passed
  steps — which has the same prerequisite. **This is the assumption most likely to fail.**
- **UAT stays openly reachable with public sign-up.** Decision 30 rejected basic auth and an IP
  allowlist as safer-looking but worse. Consequence accepted: **real accounts can reappear the day
  after a re-seed**, so FR-1100 restores compliance at a moment rather than guaranteeing it over
  time.
- **017 does not land first.** If it does, FR-1143 is moot and the script's Q&A steps describe a
  replaced surface. Nothing orders the two features; recorded as a risk, not a dependency.
- **Fixing every defect (FR-1130) may extend this feature considerably.** Accepted after the
  unknowable scope was stated. **If the walk surfaces something large, the feature grows rather than
  the known items being quietly trimmed.**

---

## Out of Scope

- **The production deploy.** Its own phase, blocked on a domain that does not exist.
- **017's Q&A rebuild.** FR-1143 *decides* what happens at launch; it does not build the
  replacement, and it does not draft the amendment one branch of that decision would require.
- **Extracting the cache key grammar** to its own module — an idea-inbox item left there, being a
  refactor with no launch consequence.
- **Appointing a platform operator.** FR-1101 issues a credential; register entry 21 asks who *is*
  the operator, and a credential does not answer it.
