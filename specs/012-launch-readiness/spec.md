# Feature Specification: 012 — Launch Readiness

**Feature Branch**: `spec/012-launch-readiness`
**Created**: 2026-08-16
**Status**: Draft
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

Constitution Principle governance requires a feature departing from the roadmap to say so in its
specification. This is that statement, following 002's precedent when it absorbed 003.

**The production phase takes no number here.** Reserving one would repeat the mistake v5.3.0's
decision 53 corrected for migrations — reserve-in-advance collided three times because branches
cannot see each other's reservations.

**One constraint the production phase inherits and must not lose**: UAT and production MUST remain
separate *registrable* domains (decision 31). That is what makes a UAT session cookie structurally
incapable of reaching production, and it was arrived at by accident of naming rather than by design.

---

## User Scenarios & Testing *(mandatory)*

### The problem this feature exists to solve

Every feature since 007 declared a `quickstart.md` walk in its own specification and **shipped
without completing it** — 007, 008, 009, 010, 013, 014 (both tranches) and 016. 110 scenarios exist
across 12 features; roughly **60 are outstanding**. This is the largest undischarged obligation in
the project and the only part no machine can do.

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
Walking them is how that bet gets settled.

### US1 — The attendee journey, walked end to end (Priority: P1)

A person signs up, joins a conference by code, and arrives at the conference happening now. They
inspect what is next, save sessions, discover an attendee, exchange a card, open a conversation,
schedule a meeting, ask a question, enrol in an optional session, and read it all again offline.

**Why this priority**: it is the core journey `requirements.md` names, it crosses every destination,
and it is the path along which the seams between features live.

**Acceptance scenarios**:
1. **Given** a signed-out visitor, **When** they complete sign-up, verification and join-by-code,
   **Then** they arrive at the conference happening now, greeted by name and told which day it is in
   the venue's timezone.
2. **Given** an attendee on the conference, **When** they walk Home → Agenda → Discover → Messages →
   Network in one session, **Then** every destination renders its content, its empty state where
   applicable, and no control requires horizontal scrolling at any tested width.
3. **Given** two attendees in two browser profiles, **When** one shares a card, **Then** both hold
   the other's card (the mutual exchange C1 ratified), and both see it in Network.
4. **Given** an attendee with saved sessions, notes and a meeting, **When** the device goes offline,
   **Then** each cached surface renders with a retrieval stamp and each uncached surface refuses
   honestly.

### US2 — The organizer journey, walked end to end (Priority: P1)

A promoted attendee signs into the administrative site, authors a conference, adds tracks, rooms,
speakers and sessions, marks one optional with capacity, watches enrolment fill, cancels a session,
and confirms the attendee side reflects every change.

**Why this priority**: 014 shipped 17 scenarios and none was walked. It is also the half that
exercises the **second notification trigger** and the changed-session marker, neither of which any
person has seen fire.

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

**Why this priority**: 013 shipped 12 scenarios and none was walked. It is lower than US1/US2 only
because the operator surface is the smallest and the most heavily asserted by absence tests.

### US4 — The layout pass at every band, in both products (Priority: P1)

Every destination, panel and dialog is looked at on a phone, a tablet, and a desk at three widths —
in **MyNet and the administrative site**.

**Why this priority**: this is the half that has never been done at all, in a product whose approved
prototype is a fixed 390×844 mobile frame. `apps/admin` has never been reviewed at any width, and
its third layout was built in `fix/purge-defects-restriction-guard-admin-layout` without a human
looking at the result.

### US5 — The physical device pass (Priority: P1)

Install MyNet on a physical iPhone and a physical Android phone; judge the icon; drive notifications;
retype the composer test with a real keyboard.

**Why this priority**: the technology stack constraint says *"test on at least one physical iPhone
before production"*, and 016's T068 has been outstanding since it shipped. iOS is also the only
platform where `InstallService`'s null-prompt half is real, and Android the only one where
`beforeinstallprompt` and Web Push delivery can be exercised.

---

## Requirements *(mandatory)*

### Unblocking the environment (prerequisite to everything else)

- **FR-1100**: UAT MUST be returned to the state standing decision 30 describes — **seeded data
  only**. The 4 genuine accounts recorded in `deploy/vm/OPERATIONS-LOG.md` are the owner's and
  colleagues' and are disposable.
- **FR-1101**: A platform operator credential MUST be obtainable on UAT.
- **FR-1102**: Obtaining an operator credential MUST NOT require destroying attendee data. The
  present coupling — `pnpm db:seed` is the only documented route and `attendeeSeed.clear` is
  unconditional with no module argument — MUST be removed, so that the next person needing a
  credential on an environment holding data somebody cares about is not forced to choose.
- **FR-1103**: The re-seed and the credential issuance MUST be recorded in
  `deploy/vm/OPERATIONS-LOG.md`, including what was destroyed.

### The consolidated launch script

- **FR-1110**: A single launch script MUST be produced, organised by **journey** (attendee,
  organizer, operator) rather than by feature.
- **FR-1111**: The script MUST be **derived** from every outstanding `quickstart.md` scenario, and
  the derivation MUST **name every scenario it retires** and where that scenario's coverage now
  lives. A derivation that silently drops a scenario is the risk-ranked subset this approach was
  chosen over.
- **FR-1112**: The script MUST cover the **seams between features** — paths that cross more than one
  feature's surface — because that is the entire justification for consolidating, and no
  per-feature walk can reach them.
- **FR-1113**: The script MUST cover **both products**.
- **FR-1114**: The script MUST state, per step, what a *pass* looks like. A step whose outcome is
  "it looked fine" is not a step.

### The walk

- **FR-1120**: The script MUST be walked in full by a person.
- **FR-1121**: The walk MUST cover three widths in both products, on real viewports rather than
  emulated ones where a physical device is available.
- **FR-1122**: The walk MUST include a physical **iPhone** pass, discharging 016's T068: install it,
  judge the icon against the in-app coral mark, and retype the composer test with a real keyboard.
- **FR-1123**: The walk MUST include a physical **Android** pass, covering what iOS structurally
  cannot: `beforeinstallprompt`, the install banner, and Web Push delivery.
- **FR-1124**: The walk MUST include a screen-reader pass over at least the five authentication
  screens and one representative destination in each product.
- **FR-1125**: Each walked step MUST be recorded as passed or failed, with the recording durable
  enough to be read later by somebody who was not present.

### What the walk finds

- **FR-1130**: **Every defect found MUST be fixed.** The scope of this requirement is unknowable in
  advance and that is accepted deliberately.
- **FR-1131**: A finding that requires a **decision** rather than a repair — a layout needing
  redesign, anything needing a constitution amendment, anything adding a capability — MUST be
  **recorded as a decision and not silently fixed**. This feature ratifies nothing.
- **FR-1132**: Every fix MUST be traceable to the script step that found it, so the walk's value is
  measurable rather than asserted.
- **FR-1133**: A defect fixed MUST have the step that found it re-walked.

### Pre-launch hygiene

- **FR-1140**: The `anonymous` cache prefix MUST NOT be able to serve one attendee's content to
  another. An offline cold start currently resolves the previous attendee from the unscoped
  bootstrap entry, adopts their identifier as the cache scope, and serves their programme, saved
  sessions and **private notes** with **no credential presented**.
- **FR-1141**: The erasure's dependency on `listRegistered()` returning a **complete** enumeration
  MUST be made breakable rather than silent. Today anything absent from that answer is destroyed;
  the day the endpoint gains a page size or a date filter, older conferences are deleted from every
  device on every Home load with no error and no test failure.
- **FR-1142**: A decision MUST be recorded on the **client diagnostic channel**. Both destructive
  cache paths are silent, so four causes of "my offline conference disappeared" share one symptom
  and none is diagnosable after the fact.
- **FR-1143**: A decision MUST be recorded on **what happens to Q&A at launch**. Today's Q&A is
  unmoderated, attributed by full name, published instantly, and has **no feature flag** —
  `SessionPanel.tsx` renders it unconditionally.

---

## Success Criteria *(mandatory)*

- **SC-1201**: A person can complete the entire attendee journey — sign up to scheduled meeting — on
  a phone they own, without assistance and without consulting the source code.
- **SC-1202**: Every outstanding scenario from 007, 008, 009, 010, 013, 014 and 016 is either walked
  or explicitly named as retired with its coverage relocated. **No scenario is left unaccounted
  for.**
- **SC-1203**: Somebody who was not present can read the walk record and tell which steps passed,
  which failed, and what was done about each failure.
- **SC-1204**: No content and no primary action requires horizontal scrolling, at any tested width,
  in either product.
- **SC-1205**: The product is installable from a physical iPhone and a physical Android phone, and
  the installed icon is judged acceptable by the owner.
- **SC-1206**: A notification raised by a real organizer action arrives on a real phone and, when
  activated, lands on the surface carrying the per-row marker.
- **SC-1207**: An attendee signing in on a device a different attendee used offline sees **nothing**
  belonging to the previous attendee.
- **SC-1208**: The number of defects found by the walk is known, and the number remaining unfixed is
  **zero** — excluding findings recorded as decisions under FR-1131.
- **SC-1209**: UAT holds seeded data only, and a platform operator can sign in.

---

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Actor and tier** | All three, deliberately. US1 is the **attendee** in MyNet; US2 the **conference organizer** and US3 the **platform operator**, both in `apps/admin`; US4 and US5 cover both products. This feature adds no capability to any actor — it validates the ones that exist and repairs what the validation finds. The two hygiene fixes (FR-1140, FR-1141) are attendee-side and change no capability. |
| **Offline behaviour** | **Unchanged, and validating it is part of the work.** No repository member is added, removed, or reclassified. FR-1140 and FR-1141 alter *when stored data is discarded*, never what any surface reads or displays. **No new cached read, no new `passThrough` member, no new device capability.** The walk itself exercises offline behaviour under US1 scenario 4. |
| **Desktop layout** | Unchanged by this feature, and **reviewed by it for the first time**. v5.4.0 R3 ratified the shipped desktop layout without a client acceptance act; US4 is where a person finally looks. Any repair follows FR-1130. |
| **Tablet layout** | As above. The 768–1279 band is where the two products **deliberately diverge** — MyNet an icon-only rail, `apps/admin` a labelled one — and R3 ratified that divergence as-is. **A finding that the two should match is a decision under FR-1131, not a defect.** |
| **Mobile layout** | As above, plus the physical-device passes (FR-1122, FR-1123). `apps/admin`'s mobile layout was built days ago and no person has seen it. |
| **Empty / loading / failure states** | Unchanged. The walk exercises them: US1 scenario 2 requires the empty state of every destination to be reached, which is the first time the "no programme" conference and the empty-thread prompt will have been seen by a person. |
| **Accessibility** | Unchanged, and covered by FR-1124's screen-reader pass. Any control found without an accessible label, a visible focus state or keyboard operability is a defect under FR-1130. |
| **Validation checklist discharged** | **This feature is the whole-product validation checklist.** It discharges every remaining item: production build, desktop and mobile rendering, navigation and event switching, search and filter, session save plus notes plus Q&A, message composition, card-sharing feedback, meeting scheduling, keyboard focus visibility and accessible labels. Nothing is left to a later feature. |
| **Identity scoping & server-side authorization** | Unchanged; no route is added or altered. **FR-1140 strengthens it on the client**: the `anonymous` bootstrap entry is currently the one part of the cache not scoped by attendee, and it is load-bearing for scoping, since a cache hit on it *sets* the scope. |
| **Deletion & export coverage** | **Not applicable, structurally: this feature adds no table and no column.** Both coverage tests derive from the Drizzle schema, so with no schema change there is nothing new for them to fail on. FR-1100's re-seed *destroys* attendee records rather than creating them, exercising the cascade rather than extending it. |
| **Event scoping** | **Not applicable: no new record is stored.** FR-1141 concerns the erasure of *per-event* cached data, which is already per-event and stays so; FR-1140 concerns the *cross-attendee* bootstrap entry, which is scoped by attendee rather than by event and stays so. |
| **Administrative counterpart** | **None, and the reason is structural: this feature adds no attendee-facing capability.** It validates existing ones and repairs defects. FR-1140 and FR-1141 are device-local cache behaviour with no server surface and therefore nothing an administrator could see, undo, or answer for. The obligation was looked at rather than skipped. |
| **Register position** | **Blocks: none.** Entries 22 and 4 both blocked this feature and both were closed by v5.4.0 on 2026-08-15. **Resolves: none.** **Escalates: entry 19** (nobody moderates avatars) — a walk that puts real images in front of a person makes that gap concrete rather than prospective; and **entry 21** (somebody must *be* the operator) — FR-1101 issues a credential, which does not appoint a human to use it. **Opens: possibly two**, via FR-1142 and FR-1143, if the owner's answers warrant register entries rather than plain decisions. |
| **Migration number** | **No migration.** This feature adds no schema. Consistent with the roadmap's own note that 012 adds none, and with `0010` remaining permanently unclaimed. |

---

## Assumptions

- **The 4 UAT accounts are disposable.** Stated by the owner. FR-1100 destroys them.
- **All four device classes are available** to whoever walks the script — iPhone, Android phone,
  tablet, and a desk machine. Stated by the owner; without any one of them the corresponding
  requirement cannot be discharged.
- **The walker is the owner or somebody with equivalent product knowledge.** The script states what a
  pass looks like (FR-1114) partly so this assumption can weaken later.
- **UAT stays openly reachable with public sign-up.** Decision 30 rejected basic auth and an IP
  allowlist as safer-looking but worse, because each disables the validation this environment exists
  for. A consequence follows and is accepted: **real accounts can reappear the day after a re-seed**,
  so FR-1100 restores compliance at a moment rather than guaranteeing it over time.
- **017 does not land first.** If it does, FR-1143 is moot and the Q&A steps of the script describe a
  replaced surface. Nothing orders the two features; this is recorded as a risk, not a dependency.
- **Fixing every defect (FR-1130) may extend this feature considerably.** Accepted by the owner after
  the unknowable scope was stated. **If the walk surfaces something large, the feature grows rather
  than the known items being quietly trimmed.**

---

## Out of Scope

- **The production deploy.** Its own phase, blocked on a domain that does not exist. Declared above.
- **017's Q&A rebuild.** FR-1143 *decides* what happens to Q&A at launch; it does not build the
  replacement.
- **Extracting the cache key grammar** to its own module — an idea-inbox item deliberately left
  there, since it is a refactor with no launch consequence.
- **Appointing a platform operator.** FR-1101 issues a credential. Register entry 21 asks who *is*
  the operator, and a credential does not answer it.
