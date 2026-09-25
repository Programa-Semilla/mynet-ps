# Delivery log — feature-by-feature record

**Moved verbatim from `CLAUDE.md`'s "Current state" section on 2026-09-24.** The constitution's
Runtime guidance forbids progress updates in `CLAUDE.md`, and this section had become ~470 lines of
them. It is a historical record as of 2026-08-15 and is **not updated**; per-feature detail lives in
`specs/<feature>/`. Several invariants were recorded here rather than under "Architectural
invariants" (010's brand-audit rules, 014 tranche 1 and 2, 016's deep review) — they remain binding.

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
runbook — and the two owner decisions that gated the first deploy are **now taken and ratified in
v3.5.0**: UAT is `mynet-dev.programasemilla.com` and the subscription is
`d428f98f-a3c4-49c3-ae24-06ec3de08477` (LinaSys-DevEnv, `centralus`). `deploy/vm/envs/uat.env`
still carries `SUBSCRIPTION=` and `APP_DOMAIN=` blank — **filling them is phase 010's work**, and
until then `deploy-uat` and `deploy-prod` keep printing what they are blocked on and exiting 0
rather than failing every merge.

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
bar was filed as register entry 4's territory and the owner's call. **Entry 4 is closed by v5.4.0
(R3)**, whose subject is the desktop and tablet layouts and which names no mobile surface, so this
is still the owner's call and no entry now carries it.

**A second layout question was open for the same reason.** The spec justified putting the mark in
the tablet top bar with "the rail is desktop-only", and that is **false** — `TabletRail` is live
768–1279px on the inverse surface, carrying navigation and no brand. `DesktopRail` is the
desktop-only one. The shipped arrangement satisfies FR-823 and FR-824 either way, but the
alternative — the mark at the head of `TabletRail` in coral, mirroring `DesktopRail` — was never
weighed, because the spec recorded that surface as not existing. Corrected in the spec; the
arrangement was recorded as an owner decision under register entry 4. **Entry 4 is closed by v5.4.0
(R3), which ratifies the shipped desktop and tablet layouts as intended.** The two items R3 names as
ratified as-is are the 768–1279px rail divergence *between the two products* and Home's two-column
cards on an upright tablet; the mark's placement is not among them, so the shipped arrangement
stands and nothing tracks the alternative.

**016 (App fixes, mutual card exchange, and the install icon) is shipped**, squash-merged to
`develop` in [#21](https://github.com/Programa-Semilla/mynet-ps/pull/21) — six items the
owner reported after using the deployed product, plus the reversal C1 ratified. Five repairs, one
reversal, one asset change: the composer is bounded so a long message can be sent on a phone, the
conversation list refreshes itself, five password fields across two products gained a reveal
control and MyNet's two credential-setting forms gained confirmation, card exchange became mutual
and atomic, the sign-in screen explains what installing buys on an uninstalled phone, and the
install icons derive from the owner's second brand source.

**It needed an amendment nobody anticipated.** Phase 0 research found that install detection cannot
be written without `matchMedia` and `beforeinstallprompt`, which `mynet/no-direct-platform-access`
refuses in feature code — so US5 was gated on **constitution v5.1.0**, adding an eighth device
capability to Principle V's list. The specification and its review gate both missed it; Principle V
is what surfaced it, which is the boundary working as designed.

**Its by-hand validation is outstanding, it is the only thing outstanding, and it shipped without
it — deliberately, on the merge decision of 2026-08-13.** T067 (quickstart
scenarios 1–7, two browser profiles) and **T068 — install on a physical phone, judge the icon, and
retype the composer test with a real keyboard** — join the same unwalked scenarios from 007, 008,
009 and 013. SC-1001 and SC-1009 are explicitly not machine-checkable, and **this feature exists
because a person found what the gates could not** — which is exactly why an unwalked T068 is a
larger debt here than the four it joins, rather than one more of the same.

A contact is somebody whose digital business card you hold. Sharing was **one-directional** as
shipped — **reversed 2026-08-12 by constitution v5.0.0 (C1): it is now a mutual exchange**, one act
and both parties hold each other's card, delivered by **016**. A held card resolves the sharer's **live** profile under a
standing consent that outlives both the conference and the discoverability toggle. Appointments are
proposed, then accepted or declined, over a seeded 30-minute slot grid whose availability is a
function of the reader's own commitments alone. Home gained its seventh and last card, which is the
**only** way an attendee learns somebody has proposed a meeting: this feature dispatches no
notification, and the bell stays forbidden.

**009 (Session Q&A — audience questions and upvotes) is shipped**, squash-merged to `develop` in
[#17](https://github.com/Programa-Semilla/mynet-ps/pull/17) — the implementation and constitution
v3.3.0 in one PR, because the amendment gated the code, as 008's did. **With it the delivery
roadmap is complete**: every feature 001–009 is delivered and every destination `requirements.md`
names answers its question. What remains adds no schema and no feature.

**The roadmap's 010 is split, by brainstorm #08 and constitution v3.5.0, because its two halves have
different blockers.** **011 — UAT Deployment and Pre-Public Hardening** is shipped: six
security-and-abuse findings that all get worse once a URL is public, then provision, DNS, TLS, a
Mailgun adapter behind `MailService`, VAPID, seed, and an **exercised restore on the real host**.
**012 — Launch Readiness and Production** carries the validation pass, the physical iPhone test, the
three-width review and production. It was blocked on register entries **22 and 4** — the sentence
here previously named entry **2**, which was resolved in v3.4.0, and it is corrected rather than
deleted — and **both are closed by v5.4.0, so 012 is startable.** Keeping the halves together would
have held a working UAT hostage to a brand mark. 010's spec must state that it departs from the
roadmap.

**Planned as two PRs and delivered as one.** The split existed so a reviewer could read the safety
half as a unit; both halves were complete and green, and holding the first open would have shipped
a Q&A surface with **no way to report anything on it** — which the Success Criteria forbid calling
complete. The boundary survives as a reading order rather than as two merges.

A question is asked on a session, published to **every attendee registered for the conference
under the author's real name with no opt-out**, and ranked by upvotes.

**All of that is reversed by constitution v5.0.0 (C2), ratified 2026-08-12, and 017 rebuilds it.**
The client's model replaces it: a question is **moderated before it is public** (submit → moderate →
publish → vote), carries **resolved/pending** state that survives the event, may be **grouped
manually** with its duplicates, and is **projectable** in vote order. The premise that forbade this
expired rather than being overturned — 009 recorded against itself that a public Q&A surface *"needs
a moderator, and a moderator is an organizer"*, and v4.0.0 created that actor. **Attribution was NOT
part of the reversal, and it is now settled separately**: full name stands as shipped, and
**v5.4.0 (R2) closed register entry 27 — a published question is attributed as first name plus
surname initial, "Ana R.", wherever it is displayed, including the moderation queue and the
projected screen. 017 is unblocked.** It must close the unthrottled block lookup in the same
feature, or the abbreviation relocates disclosure rather than reducing it. Until 009 is rebuilt,
everything below describes what is running.

That visibility is the
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

**013 (Administrative foundation, the second actor, and the report queue) is shipped**,
squash-merged to `develop` in [#20](https://github.com/Programa-Semilla/mynet-ps/pull/20) — the
first feature with a second actor, and the first to ship a **second product**. It is the delivery
of standing decisions 31–39, and the reversal was **forced rather than sought**: register entries
19 and 21 had both been traced in writing to the administration exclusion, and 009 recorded that a
public Q&A surface "needs a moderator, and a moderator is an organizer". An exclusion whose cost is
an unkeepable safety promise must be paid for or reversed.

`apps/admin/` is a separate website on `admin.<host>`, against the same API and database. **MyNet
gained no admin surface, no privileged view and no role-dependent rendering**, and that is asserted
as an absence rather than claimed. A platform operator is seeded with **no credential**; a
conference organizer is a promoted attendee whose attendee experience is unchanged in every
observable way.

**Its by-hand validation is outstanding, and it is the only thing outstanding.** T158 and T159 —
the eleven `quickstart.md` scenarios — join the same unwalked scenarios from 007, 008 and 009.
`pnpm start` now brings up the API, MyNet **and** the administrative site together and prints a
generated operator credential, so that walk is one command away rather than four.

**A deep review recorded 49 findings and deferred nine as needing decisions; those were then taken
as an explicit decision round rather than carried into the merge** — eight fixed, one accepted.
`specs/013-administrative-foundation/review-findings.md` records both passes.

**Four of the nine were one defect, and it is the most transferable thing 013 produced: four
functions whose emphatic headers described call relationships that did not exist.**
`appendAuditEntry` said *"every write path"* passed a transaction and **none did**;
`assertVerifiedOperator` said it was called at the query layer and was called nowhere;
`addressTakenByOtherPrincipal` said it ran inside the caller's transaction and was called only by
tests; three helpers named callers that were inlined copies. In a codebase whose discipline is that
the comment is the record, a header is a claim that needs a guard like any other — and **three of
the four already had the executor parameter**, so what looked like design work was wiring.

**Migrations claimed so far run to `0012`** (`0012_optional_sessions_and_taxonomy.sql`, claimed by
014 tranche 2; `0009` is 013's, `0011` tranche 1's, and 010 added no schema). **`0010` is permanently
unclaimed** — it was reserved for 012, which adds no schema, and **v5.3.0's decision 53 replaced
reserve-in-advance with claim-at-generation**, so nothing will ever fill it; a gap in the sequence is
the cheaper artifact than a fourth collision. That numbering was the **third** collision between
parallel branches over a reservation, and **014 extended the roadmap's reserved-number table rather
than correcting it**
(T102): it stopped at the shipped attendee programme and covered neither programme in flight, so a
feature reserving a number had nothing to read. The rule it gained is that a phase in a *parallel*
programme must extend that table in the same change, because the branch it would otherwise collide
with is one nobody can see from its own. The journal lists `0003` before `0004` while carrying a
later timestamp — `apps/api/migrations/meta/README.md` explains why both halves are load-bearing and
what a regenerating feature must not "fix". Anyone regenerating must move that README aside first,
because `drizzle-kit generate` JSON-parses every file in `meta/`.

**`0009` was regenerated once, deliberately, and that is only safe before a migration has been
applied anywhere.** Two foreign keys had no covering index. Because `0009` had reached no database,
the file could be rebuilt rather than followed by an `0010`; the diff is two `CREATE INDEX` lines
and a later `when`. **`lock_timeout` went into `migrate.ts`, not the SQL** — a hand edit to a
generated file is erased by the next regeneration, and putting it on a dedicated migration
connection covers *every* migration, including `0003`, whose missing timeout was a recorded
unclaimed defect from 004's review.

**014 (Conference content authoring) is SHIPPED — closed by tranche 2, squash-merged to `develop`
in [#24](https://github.com/Programa-Semilla/mynet-ps/pull/24) on 2026-08-15.** Brainstorm #11
rescoped it from a parallel branch on 2026-08-12, and the owner decided on 2026-08-14 that **014
stays open and grows** rather than closing at what was built — #11's *"rescoped and kept whole"*,
honoured literally; tranche 2 is what it grew into, and merging it is what closed the feature.

**Tranche 2 is MERGED as of 2026-08-15, on constitution v5.3.0 — ratified 2026-08-14 — and it
is the change that closed 014.** It carries **all three** outstanding rows: the event model
(modality and format as two orthogonal axes, an optional room, a validated `https:`-only access link),
optional sessions (capacity, a relative closing offset, enrolment **replacing** saving, a named
roster), and the profile taxonomy. 93 requirements (FR-1045–FR-1099), 15 success criteria, 109 tasks
(T106–T214), one PR, migration `0012`. **T206 and T207 — the by-hand walks of quickstart scenarios
10–17, the latter needing a person and a phone — are outstanding and join the unwalked scenarios from
007, 008, 009, 013, tranche 1 and 016.** Everything a machine can check is checked and green,
including an end-to-end journey in which three attendees race for two places. **A deep review
preceded the merge and is recorded as Part II of
`specs/014-conference-content-authoring/review-findings.md`**: 107/107 spec compliance after one
FR-1047 fix (a guard the `events.ts` header claimed existed and did not — 013's false-header class),
then 20 findings from five perspectives, 16 fixed, 2 Minor deliberately deferred to a maintenance
pass, and 2 Notable observations captured to `brainstorm/idea-inbox.md` — one of which, the roster
read writing no audit entry, touches the fourth privacy exception's disclosure moment and deserves a
decision rather than a rediscovery.

**Invariants tranche 2 establishes:**

- **The enrolment critical section is one lock with four callers** — enrol, release, a capacity
  edit, and delete — all under `SELECT … FOR UPDATE` on the session row (research R12). N
  concurrent takers of the last place produce exactly one refusal, and the refusal says the session
  is **full**, which is a different sentence from **closed** (FR-1069/FR-1069a): the codes are
  asserted mutually different, and adding a refusal means a distinct sentence plus updates to the
  mutual-difference sets in both clients.
- **`NOT_ENGAGEMENT` carries its first entry, and every future entry must say whose data it is and
  why losing it silently is acceptable** (decision 51). An enrolment is outside decision 49's four,
  so a session with held places may be deleted; the dialog states the number held and that nobody
  will be told. **The held-places figure must never join `EngagementCounts`** (R15) — it would make
  places-held sessions undeletable and quietly widen decision 49.
- **The commitment set is one repository with a `saved | place` discriminator**, renamed
  `CommitmentRepository` rather than grown a second member (R13). Remaining places is a **live
  `passThrough` read** while the commitment set stays **cached** — deliberately opposite, because a
  stale place count reads as a promise of a place.
- **The fan-out is a union of savers and place-holders** — one coalesced notification per attendee,
  whichever commitment they hold (`dispatch-no-commitments` renames tranche 1's guard to say so).
- **Discover's filter options split by what the vocabulary is**: a closed choosable vocabulary is
  offered whole (it is not population data), while roles keep accumulating what the reader has seen
  (T214; guarded by `discover-filter-options.test.ts`).
- **A CHECK constraint over an enumerated set is DERIVED from the source of that set**
  (`ADMIN_AUDIT_ACTIONS`), never hand-copied — a 14-action literal drifted and broke only in
  cross-file-order runs.
- **A new integration file that depends on the seed reseeds in `beforeAll`.** Files run in size
  order, so a tranche that changes file sizes re-exposes D19's weakness in files that never
  changed; seven new files gained `resetDatabase()`.
- **A CORS method list is exercised by nothing but a real browser's preflight.** `PATCH` — every
  administrative update verb — was missing from it while all of T086's route-level tests passed,
  because `fastify.inject()` performs no preflight; found by T202's end-to-end suite when every
  admin edit failed as an opaque network error. The list in `app.ts` now carries a comment per
  method naming its callers.

**The record said the taxonomy was blocked on the client's lists, and that was wrong.** Brainstorm #12
found REQ-035 names the four sectors verbatim — Servicios, Comercio, Industria, Agro — and that #11
had already ruled the taxonomy to be authored or seeded data rather than a spec constant. What is
missing is the *subsector* and *interest* lists: content for a surface, not a prerequisite for building
one. **It also found two requirements already shipped**: REQ-012's "short description" is
`sessions.summary`, and REQ-014's "presenters" are `speakers`. Everything below this paragraph
describes **tranche 1**, which is complete.

**Tranche 1 is implemented**, on constitution **v5.2.0** — the amendment
that gated its first line of code, as v3.1.0 gated 007's Phase 7, v3.2.0 gated 008, v3.3.0 gated 009
and v4.0.0 gated 013. It delivers standing decisions 45–49 and is the **second** administrative
feature: an organizer authors tracks, rooms, speakers and sessions in a conference they are assigned
to, a platform operator does so in every conference, and either tier may create one.

**The split is the opposite of the one anyone would guess.** Authoring looks like the big new thing
and is mostly wiring — 013 built the site, the shell, the session, the audit trail and the tier
model. The genuinely new mechanisms are both small and both on the **attendee** side: a second
notification trigger, and a marker that must not become an inbox.

**Its by-hand validation is outstanding, and it is the only thing outstanding.** T105 —
`quickstart.md` scenarios 6–9, which need a person and a phone: the notification, the coalescing,
the denied permission, and the three widths plus a screen-reader pass. It **joins** the unwalked
scenarios from 007, 008, 009 and 013 rather than replacing them. Everything a machine can check is
checked and green, including an end-to-end journey in two browser profiles across two origins.

**The most transferable thing it produced is a defect the client had already been taught to
avoid, arriving from the other end.** 008 classified refusals on the **class** — `ApiError extends
RequestRefusedError`, every non-2xx throws `ApiError` — and swallowed every message its routes wrote
to be read. The rule that came out of it was *classify on `error.code`, never on the class*. 014
obeyed that rule and reproduced the outcome anyway: its routes were written with **four distinct 409
explanations all carrying `refused`** and two distinct 400s all carrying `validation_failed`, so six
carefully-written refusals rendered as two sentences. The one that mattered most —
*"cancel it instead, everything they wrote stays where it is"*, which teaches decision 49's whole
rule at the moment an organizer meets it — was unreachable. **The rule needed its other half
stated: classifying on the code is worth nothing unless the code says which refusal it is.** Six
codes were added, following `question_has_votes` and `own_question`. Found by the
**mutual-difference** assertion and by nothing else — a test checking that each code maps to *a*
message would have passed, because every one of them did. Two of them.

**Three further invariants this feature establishes:**

- **A second notification trigger exists, and it is bounded by three named changes** — cancelled,
  start time, room (v5.2.0 N1). A session **starting** is still forbidden, and the distinction is
  load-bearing: a reminder is something an attendee can set themselves, a change is information only
  the product holds. `no-session-start-trigger.test.ts` asserts the **mechanism** rather than the
  word — nothing time-driven may dispatch, because a reminder needs a scheduler and a grep for
  "starting" can be renamed around. `DISPATCH_CALLERS` now has two entries and both are route
  modules; a third is another amendment.
- **The marker is per-row state and the count exists only in the payload.** It rides on the existing
  `listSaved` read (research R7), so 014 declares **no new cached read**, adds **no device
  capability**, and leaves `substitution.test.ts` untouched — asserted as an unchanged file against
  the branch point, which is the cheapest proof a capability was not added. *That guard originally
  froze the count at seven and broke when 016 ratified an eighth; branch-relative next, it broke
  again in every post-merge context; since fix/post-merge-verification it compares the set at the
  feature's pinned history range (`63bfd977..8b775e17`, `tests/support/feature-range.ts`), which is
  the property 014 owes stated in a form no checkout context and no later amendment can falsify.*
  The one member added is
  `markViewed`, a **write**, whose cache purge is correct rather than tolerated: the programme it
  clears is the one that just changed. *"No view in either product may present that count"* is
  asserted over both clients.
- **A session anybody has engaged with may be cancelled and must not be deleted** (decision 49),
  checked under `SELECT … FOR UPDATE` **inside** the deleting transaction. The four cascades from
  `sessions.id` are **not removed** — they stay correct for the case deletion is still permitted —
  so the protection is the refusal plus the lock rather than a change to the referential rules.
  Cancellation is **stored state**, unlike 008's derived `lapsed`, because it is an organizer's act
  rather than a function of the clock.

**One asymmetry is worth reading twice, because it is one condition wide.** FR-1022 marks a
cancelled session everywhere — the programme, the Agenda row, the panel, the rest-of-day timeline —
and FR-1022a **omits** it from exactly one surface: "Up next", which answers *where do I go now*.
`nextSession()` is the single change point serving both Home cards that ask it; `restOfVenueDay`
deliberately does not inherit the filter. The two functions sit six lines apart and the difference
between them is one condition, so it is asserted at the unit layer **and** at the component layer,
where two Home cards read the same programme and disagree about it on purpose.

**Three absence guards were written too broadly and caught correct code**, each corrected by
narrowing to the population the requirement is actually about — the same class of correction 009
made to the event audit's conference-content predicate. Filtering by an identity the caller already
holds is not disclosing it (a `WHERE` is not a `SELECT`); 013's report queue reads reported messages
under its own recorded exception; and `appointments.status` is a negotiation between two attendees,
not a content lifecycle. All three are recorded in `deviations.md` D14, because "scoped deliberately"
and "weakened until it passed" are indistinguishable in a diff.


---

## Open questions, as CLAUDE.md summarised them on 2026-08-15 (verbatim)

**Do not silently resolve any of these.** The authoritative register is in the constitution; this
is a working summary. Each names what it blocks, because *when* to ask matters as much as what.

### Require a client decision

**No open question blocks a feature.** v5.4.0 closed entries 22, 27 and 4 on 2026-08-15, unblocking
017 and 012 together — which restores the position this section held from v3.2.0 until v5.0.0 opened
entry 27 on 2026-08-12. Everything below blocks **release**, not code. *The paragraph this replaces
said "one open question now blocks a feature again — entry 27 blocks 017", and it was true for three
days.*

- ~~**Register entry 27 — Q&A attribution: full name, first name alone, or attendee-chosen.**~~
  **RESOLVED 2026-08-15 in v5.4.0 (R2)** as standing decision 55: **first name plus surname initial,
  "Ana R."**, wherever a question is displayed, including the moderation queue and the projected
  screen. **017 is unblocked**, and it carries two obligations — close the unthrottled block lookup
  in the same feature, and do not read `authorId` or `listBlocks` as settled by this. *Original
  entry:* Opened
  by **v5.0.0 (C2)**. **Blocks 017.** v3.3.0 bound the full real name and argued it at length; the
  client asks for the first name alone (REQ-062, REQ-063); **her own extraction records the thread as
  unresolved** (OPEN-002) and the transcript carries both positions in one conversation. REQ-061 adds
  something neither position states — the system must know the true author whatever is displayed —
  which is compatible with all three answers. **Opened rather than settled deliberately**: the
  client's stated preference was available and taking it would have closed by inference a thread she
  herself recorded as open. The case that decides it is mundane and should be put to her directly:
  two attendees named Ana at one event. **The three options it enumerates are the reason it looked
  like a hard trade: six existed, and the one chosen was not among the three.** It was decided on
  the client's behalf and **she must be told**, because the chosen form is in tension with her
  literal words.
- **Register entry 28 — two brand marks now coexist, and which one is MyNet's is undecided.** Opened
  by **v5.0.0 (C4)**. **Blocks nothing**; the product behaves as directed. Recorded because a
  knowingly accepted divergence and an unnoticed one look identical six months later, and because
  resolving it either way is expensive. **No feature may resolve it by quietly replacing one mark
  with the other.**

- **A card acquired by mutual exchange outlives the discoverability toggle that licensed it — and
  whether that residual is accepted is NOT decided.** Raised by **016's deep review**, not by an
  amendment, so it is recorded here rather than numbered in the constitution's register;
  **promoting it to a numbered entry is an owner act.** **Blocks nothing** — the product behaves
  exactly as C1 ratified.

  C1 licenses taking somebody's card without asking on one ground, and FR-1053 enforces it: a card
  resolves only what its owner already published to co-attendees, so **the exchange moves *when* a
  co-attendee sees those fields, not *whether*.** That holds for the **instant** of sharing. It does
  not hold for the **duration**. Discoverability is revocable and event-scoped; a held card is
  neither, cannot be recalled, and resolves the **live** profile — including avatar bytes —
  indefinitely, because `heldCardSelect` deliberately applies no discoverability, no verification and
  no registration condition. Those three absences are correct and are the feature; the point is that
  C1 made them reachable by *one party's* act.

  So looping `POST /cards` over the directory converts a revocable publication into a permanent one.
  016 narrowed it — the `card_share` throttle was tightened and its comment corrected, because that
  comment had claimed the reciprocal row "harms nobody" and it is the sentence a later change would
  cite to raise the ceiling. **A throttle bounds a rate, not a right**, which is why this is recorded
  rather than closed. The subject also cannot see who holds their card: `GET /cards/shared` exists
  and has **no client consumer**, so the only remedy — blocking — requires knowing whom to block.

Historically: v3.2.0 closed the connection model, card-exchange semantics
and Q&A attribution; **v3.3.0** closed public Q&A visibility and withdrew FR-756a; **v3.4.0** closed
the oldest entry of all, the brand mark; **v3.5.0** closed four more — the UAT address, the mail
provider, VAPID custody and the operator address; and **v4.0.0/v4.1.0** opened entries 24, 25 and 26
and closed all three in the same session. **v5.4.0 closed three more on 2026-08-15 — 22, 27 and 4 —
and opened none**, which is the largest number closed at once since v4.1.0 and the first amendment
whose whole subject is closing questions rather than licensing work. **009, 010, 011, 013 and 016
are shipped, and the attendee delivery roadmap is complete.** Two of those closures — card-exchange
semantics and Q&A visibility — were **reversed on 2026-08-12 by v5.0.0**, which is the first time
this project has reopened settled ground on client feedback rather than on a design finding.

**Two programmes are now in flight and their numbering interleaves, which is worth stating once
rather than re-deriving.** The attendee roadmap ends at **012 — Launch Readiness & Production**,
still queued. The administrative programme runs **013, 014, 015** and began while 011 was in a
parallel branch; 013 took the next free number rather than the next number in its own sequence,
because parallel branches cannot see each other's reservations. The constitution records the same
lesson about version numbers three times over. **A third strand now runs beside both** — the client
feedback programme that v5.0.0 opened, of which **016 is delivered and 017 (the Q&A rebuild) is
startable as of 2026-08-15**, register entry 27 having closed.

**014 is CLOSED: both tranches are merged to `develop`.** That sentence replaces one saying tranche
1 was merged and 014 remained open, which itself replaced one written a day earlier saying nothing
was in flight, and one written hours earlier saying this work would be held un-integrated — **the
hold was reversed the same day, before it took effect.**

Tranche 1 landed via PR [#23](https://github.com/Programa-Semilla/mynet-ps/pull/23), squash-merged
after all eleven CI jobs passed and `verify:clean` ran 13 of 13 green against a database that had
never existed. It carries constitution **v5.2.0**, migration `0011`, and `deviations.md` **D22**.

**Tranche 2 landed via PR [#24](https://github.com/Programa-Semilla/mynet-ps/pull/24)**,
squash-merged 2026-08-15 from `spec/014-conference-content-authoring-tranche-2` — a fresh branch off
`develop` against the same spec directory — after all eleven CI jobs passed and its deep review
(Part II of `review-findings.md`) closed. Delivered as specified: event types, optional sessions
with capacity and enrolment, the profile taxonomy, migration `0012`. What remains of 014 is the
by-hand validation (T206/T207) that every feature since 007 has carried forward.

**Merging rather than holding removed a standing obligation, and that is why it was the better
choice.** Held, this branch would have had to re-merge `develop` on every merge to `develop` —
because it had already diverged once, and reconciling 016 cost a full session and collided on **five**
separate numbering tables: constitution version, standing decisions, register entries, brainstorm
session number, and nearly the migration number. Integrated, that debt is paid and tranche 2 begins
from a current base. This is the collision itself, recorded where it happened: 016 was authored on
`develop` while 014 was authored on a branch taken before it, and each artifact honestly described a
project in which the other did not exist. 014 merged `develop` into itself on 2026-08-14, taking
the renumbering described under standing decision 45, and closed in #24 the next day.

**Three features are startable, and that is the single biggest change v5.4.0 makes to this brief.**
With 014 done the administrative programme has one feature left — **015** — and until 2026-08-15 it
was the *only* startable work. v5.4.0 closed the three entries that held the other two: **017** (the
Q&A rebuild) was blocked on entry 27 and is now unblocked by decision 55, and **012** (Launch
Readiness and Production) was blocked on entries 22 and 4 and is now unblocked by decisions 54
and 56. **Two of the three carry an obligation out of the amendment**, neither tracked by a register
entry because none was opened: **015** must widen the attendee-restriction guard before it is
specified, and **017** must close the unthrottled block lookup in the same feature as the
attribution change. **A third obligation belongs to nobody yet** — `AdminShell`'s missing third
layout is carved out of decision 56 as a defect and must be fixed, and the amendment assigns it to
no feature. Choosing among the three is an owner decision, not a planning inference.

The closing sequence for 24, 25 and 26 is worth keeping, because it is the argument for opening
entries you cannot yet answer: those three produced a **third privacy exception**, a
**CSRF-adjacent topology decision**, and a **deletion rule touching decision 12**. None is a spec
detail, and all three would have been settled by inference inside a feature specification had they
not been opened deliberately.

- ~~**Register entries 24, 25 and 26**~~ — **RESOLVED 2026-08-11 in v4.1.0** as standing decisions
  38, 39 and 37 respectively. They are now binding text rather than questions.

- **Register entry 29 — whether an attendee may suppress content in notifications.** Opened by
  v5.2.0, and **promoted** rather than new: it has sat in prose since v3.1.0 as "accepted rather than
  solved". A saved-session notification carries a session title, so what somebody chose to attend is
  now on their locked device alongside what somebody said to them. **Two amendments have accepted the
  same cost without deciding the mitigation**, and the usual one — a per-attendee content preference
  — has never been weighed. Numbered now because a consequence recorded twice in the same words is
  one nobody acts on. **Blocks nothing.**

- **Register entry 30 — speakers are personal data about people who are not attendees.** A speaker
  row carries a real person's name, title and company, and has since 002. What v5.2.0 changes is that
  the rows become **organizer-authored**, moving responsibility from a reviewed commit to a promoted
  attendee typing into a form. Principle VIII has only ever considered attendees, and both coverage
  tests derive from the schema, so the question they cannot ask is who answers for somebody who never
  signed up. **Blocks nothing today; blocks any claim that Principle VIII's coverage is complete.**

- **Register entry 31 — whether deleting a session should notify the attendees enrolled in it.**
  Opened by v5.3.0. Standing decision 51 places an enrolment outside decision 49's engagement set, so a
  session with places held may be deleted — and because enrolling **replaces** saving on an optional
  session, those attendees hold no saved row and are reached by no marker and no push. **A held place
  can disappear with no trace, and the person learns by arriving.** The obvious remedy is exactly what
  cannot be done cheaply: a deletion is not one of the three material changes, so notifying on it is a
  **third trigger** and needs its own amendment. Opened rather than solved, on the reasoning v4.0.0
  gave when it predicted the third privacy exception and refused to grant it by inference. **Blocks
  nothing**; the product behaves as decision 51 ratifies.

- **Whether the audit trail's retention clock should start at pseudonymisation, as two comments
  already claim it does.** Opened by 013 (`deviations.md` D11) and found only by writing the sweep's
  first behavioural test. `maintenance.ts` declares *"365 days after pseudonymisation"* and
  `admin-audit.ts` says the clock "starts then"; the predicate measures `occurred_at`, so an entry
  written 400 days ago and pseudonymised *yesterday* — because that is when somebody exercised
  erasure — is swept on the next hourly pass rather than a year later. **The accountability record
  for a recent erasure disappears immediately.** Fixing it needs a `pseudonymised_at` column and
  therefore a migration, which makes it a decision about the retention rule rather than a repair.
  `retention-sweep.test.ts` pins the shipped behaviour and says in its own message that it encodes
  current rather than desired behaviour. **Blocks nothing.**

- ~~**Desktop and tablet layouts are unvalidated** — register entry 4.~~ **RESOLVED 2026-08-15 in
  v5.4.0 (R3)** as standing decision 56: **closed by owner ratification, without the client
  acceptance act it asked for**, and **012 is unblocked**. It is **not** a claim that the layouts
  were validated, and not a claim that green gates validated them — v5.0.0's rule on that stands
  unamended and deliberately unused. Ratified as-is: the 768–1279px rail divergence between the two
  products, and Home's two-column cards on an upright tablet. **Carved out as a defect and still to
  be fixed**: `AdminShell` presents two layouts where Principle IV requires three. *Original entry,
  with its filing corrected:* The approved prototype is mobile-only — a fixed
  390×844 frame. Every desktop layout built before this is answered is unreviewed design, so the
  cost compounds with each feature. **008 turned this from a risk into an observed defect**: the
  first dialog a human looked at was rendering in the top-left corner, having passed every gate.
  **Blocked 012, not 011** — this brief said 011, which shipped — and it had never been
  *answerable*, because reviewing a layout needs a
  running product at a real screen width. 010's UAT is what makes it a question somebody can be
  asked, which is a reason to sequence 010 first rather than to keep waiting.
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
- ~~**Real brand mark and application icons.**~~ **ANSWERED 2026-08-10, ratified in v3.4.0, and
  now BUILT** — the owner supplied a brand board, closing the oldest entry in the register, and 010
  carried it into the product. Every icon on disk is derived from that board; the amber-banded
  placeholder and the script that drew it are deleted. What remains is a person looking at it on a
  phone.
- **Whether `requirements.md` is amended** or its divergence from the constitution simply recorded.
- **What "PS" denotes** in `mynet-ps`.

### Require an owner or planning decision

*Entries 19, 20, 21, 22 and 23 were filed above, under a client decision, until 2026-08-15. The
constitution files all five here and is authoritative; they were moved in v5.4.0's hygiene pass,
which also removed a second copy of entry 19 that had been carried in both sections.*

- ~~**No domain is registered and no Azure subscription is named**~~ — **CLOSED in v3.5.0**
  (decisions 30–32). UAT is `mynet-dev.programasemilla.com`; production is `mynetcr.com`
  provisionally and **stays out of `prod.env` until registered**, because a blank value is what
  keeps the deploy jobs' refusal honest. Subscription `d428f98f-a3c4-49c3-ae24-06ec3de08477`
  (LinaSys-DevEnv), `centralus`. `deploy/vm/envs/uat.env` still has `SUBSCRIPTION` and `APP_DOMAIN`
  blank — **filling them is phase 010's work**, and this amendment is what licenses it.
  `deploy/vm/OPERATIONS-LOG.md` records the restore exercised locally against a throwaway
  container; 010 does it on the real host.
- ~~**UAT access control**~~ — **CLOSED in v3.5.0** (decision 30): openly reachable, **seeded data
  only**. FR-067 is satisfied by the data rather than by the door. The data-separation half was
  already binding and is unchanged — the tooling must *refuse* to point UAT at production data, not
  merely be configured not to.
- **Authentication ownership** — self-implemented versus a delegated provider. Worth noting what
  "open" means here: it *is* self-implemented and has shipped since 004; the question is whether
  that is settled or an unratified default. Blocks nothing.
- ~~**The transactional email provider**~~ — **CLOSED in v3.5.0** (decision 33): Mailgun.
- **Register entries 19 and 21 are ADDRESSED but NOT closed — by v4.0.0, v4.1.0, or 013 shipping.**
  **19 is that nobody moderates uploaded avatar images**: public self sign-up plus image upload, and
  the organizer exclusion foreclosed the usual answer for the whole of this entry's life. **v3.5.0
  escalated it without resolving it** — decision 30 makes an openly reachable environment with
  public sign-up a present fact, so it is no longer hypothetical — and decision 35 narrowed it by
  supplying the operator mailbox 007's report path always needed. 013 then built the first actor
  capable of moderating an avatar and of reading a report queue, and v4.1.0 decided what that
  operator may *see* — but **a capability is not a policy**. Who moderates, against what standard,
  on whose complaint, with what appeal, and whether a removed avatar is replaced or blanked are all
  undecided (19); and somebody still has to *be* that operator, which v3.5.0's address does not
  appoint (21). Bounded meanwhile by UAT carrying **seeded data only** and by the URL being
  unpublished. **These two are the oldest live entries in the register**, and they are the reason
  the administration exclusion was reversed at all.
- ~~**Register entry 20 — the push provider, and VAPID key custody**~~ — **CLOSED in v3.5.0**
  (standing decision 34). The "push provider" half was **withdrawn as never having existed**: Web
  Push signs with the project's own key pair and posts to whatever endpoint the browser issued, so
  there was never an account, an SDK or a third party to choose.
- ~~**Register entry 21 — the operator address abuse reports are sent to**~~ — **CLOSED in v3.5.0**
  (decision 35): `apps@programasemilla.com`. The obligation behind it is not closed and cannot be by
  naming an address — somebody has to read that inbox for the dialog's promise to stay true, which
  is why the entry also survives above as ADDRESSED-not-closed.
- ~~**Register entry 22 — a cached conference can outlive a withdrawn registration by up to 24
  hours.**~~ **RESOLVED 2026-08-15 in v5.4.0 (R1)** as standing decision 54: **ACCEPTED, not
  fixed**, and **012 is unblocked**. The 24-hour readable window is ratified; **the ground it was
  tolerated on is struck as false**, since cached appointments have carried the counterpart's
  display name and meeting topic since 008; it is accepted instead on the ground that no third party
  can end a registration today — **which 015 can falsify, so the attendee-restriction guard must be
  widened before 015 is specified.** Two mechanisms licensed, three rejected on evidence, the
  lifetime figure deferred, and two shipped defects fixed regardless. *Original entry:* Conceded by
  009 when FR-756a was withdrawn, and **product-wide rather than 009's**: no
  undecorated repository — Messages, Discover, cards, profile or Q&A — purges on refusal. Filed
  against the phase that became 011, which did not answer it: 011 adds no repository and no cached
  read, so the single answer that covers all of them is still owed. **013 did not answer it
  either** — the administrative client caches nothing at all. **Blocks 012.**
- **Whether `navy-800` and `coral-500` adopt the brand's values** (`#0d1942`, `#fe6551`) — register
  entry **23**, opened by v3.4.0. Measured from the board, brand and tokens disagree on both; cream
  agrees. Adopting them makes the board the single source of truth for colour and removes the
  visible seam between the icon plate and the token-derived `theme_color` on the splash screen — but
  `navy-800` is the primary surface and `coral-500` is both the accent and the focus ring, so it
  repaints the whole product and every contrast ratio must be re-verified. **Blocks nothing**, and
  011 was explicitly forbidden from resolving it. *This brief numbered it 22 in one place until
  v5.4.0's hygiene pass; 22 is the cache gap, now closed.*
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
