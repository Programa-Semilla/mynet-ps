# 012 — The Consolidated Launch Script

**This document is the feature** (plan.md: *"quickstart.md is not a by-product here — it is the
work"*). It is derived from every by-hand scenario in every `specs/*/quickstart.md` — 136
enumerated walk units across 13 features, inventoried without keying on heading shape (the
assumption that hid 006 from an earlier draft) — organised by **journey** rather than by feature
(FR-1110), covering **both products** (FR-1113), with a stated pass per step (FR-1114).
The full accounting of all 136 units is **Appendix A**; no scenario is left unaccounted for
(SC-1202). *(Phase 0's figure was 122: it counted numbered scenarios; the enumeration also
caught machine-only closing sections and unnumbered walk sections, and every one is in the
ledger.)*

**Walk it in order. Parts consume each other's outputs** — A establishes the actors, B authors
the conference, C walks it, D looks at it, E destroys it — and all five share one UAT database
with no reseed between them. An unfinished walk is not a passed walk: the record shows where it
stopped.

---

## Part 0 — Ground rules and setup

**The environment is deployed UAT and nothing else** (FR-1120a): `mynet-dev.programasemilla.com`
and `admin.mynet-dev.programasemilla.com`. A walk against `localhost` exercises no TLS, no real
push service, no deployed build and no UAT marker. Before starting, record in `walk-record.md`'s
header: the deployed base commit, and — because FR-1127's three seeded defects ride in a
throwaway build — the **named seed patch** on top of it. Both halves, always.

**Recording** (FR-1125, FR-1126, SC-1203): every step below has a row in `walk-record.md`. A row
carries an **observation — what was actually on the screen — never a verdict alone**; "pass" with
no observation is not recorded. Every layout and install step also names a **capture** (screenshot
or photograph) stored in `captures/`, at the width or device the step names. Defects go to
`defect-register.md`, one row each, naming the step that found them (FR-1132).

**Accounts.** Seeded: `ada@example.com`, `grace@example.com`, `alan@example.com` (password in
`tests/support` — committed and public-safe; UAT holds seeded data only by design). Operators:
`operator@mynet.invalid` (credential chosen by the owner), `second.operator@mynet.invalid`
(initial credential with the walk coordinator; FR-992 forces replacement at first sign-in). The
walker additionally uses **their own real-inbox address** — a `danny.perez.u@gmail.com` account
already exists from 012's mail proof and can be this account.

**Two browser profiles, not two tabs — and not incognito for anything involving push.** This
prerequisite used to be re-established six different ways across six quickstarts; this is the one
statement (FR-1110's justification made literal). Two tabs share a session — you would be talking
to yourself. Incognito kills push subscriptions with the window and some browsers auto-deny
notification permission in it; 007's trap, carried here so nobody re-meets it.

**Widths: 390, 768 and 1280 — one triple, chosen deliberately** (closing the six-inconsistent-
triples finding). Why these: they are the **band edges** — bottom navigation hands over to the
icon rail at 768, and the icon rail to the full desktop rail at 1280 — and edges are where layout
defects live. The automated sweep deliberately measures mid-band (375/900/1440), so human eyes at
the edges and the machine at the centres cover the range between them. Per FR-1121 the widths are
walked **on real viewports**; emulate only a width no available device provides, and record each
emulated width and why in `walk-record.md`.

**Throttles are not defects — and mistaking one wastes an afternoon** (seam S15). A consolidated
walk performs, in quick succession, actions that real attendees spread over days: reports, card
shares, sign-ins, questions. Each is throttled per action. If a refusal arrives after repeated
same-action requests: wait the stated period, retry once, and only then record a defect. Two
things ARE defects: a throttle refusal that does not say it is a throttle, and reset-request
being **denied** rather than delayed (it must never deny).

**Q&A steps are walking a surface v5.0.0 retracted and 017 will rebuild.** They are still
walked: the shipped behaviour (instant publication, full-name attribution, vote ranking) is what
is running, and a break in it is still a defect (FR-1130). A finding that is really 017's design
— moderation, "Ana R." attribution, resolved/pending — is recorded as a decision (FR-1131), not
fixed.

**If a real stranger's account appears on UAT mid-walk**: continue, and record the occurrence —
public sign-up is open by design (decision 30), and the observation is evidence about FR-1100's
durability, not an interruption.

---

## Part A — The operator journey (US3)

*Establishes the actors everything after depends on. Admin host throughout.*

- **A1 — First sign-in forces a credential of the operator's own.** Sign in at
  `admin.mynet-dev.programasemilla.com` as `second.operator@mynet.invalid` with the initial
  credential. **PASS**: before any administrative surface renders, a replacement password is
  demanded (FR-992); after replacing, the administrative destinations render.
- **A2 — Two independent sessions** *(013/3 — the half `localhost` cannot prove)*. In the same
  browser profile, sign into MyNet as an attendee AND into the admin site as the operator. Sign
  out of MyNet. **PASS**: the admin session survives. Sign back in, sign out of admin. **PASS**:
  the MyNet session survives. (Host-only cookies on two real hosts — the deployed pair is the
  only place this is testable.) Then clear the admin session cookie (or let it idle past its
  bound) and act: **PASS**: the demand to sign in again is distinguishable from a failed
  sign-in (013/10).
- **A3 — The empty report queue is a state, not an error.** Open the report queue before any
  report exists. **PASS**: an explicit empty state; nothing renders as a fault.
- **A4 — Promotion.** Promote the walker's second attendee (e.g. `grace@example.com`) to
  conference organizer. **PASS**: the promotion is visible in the operators' view; no error;
  (their unchanged attendee experience is B1's assertion).
- **A5 — The tier boundary is real** *(013/6)*. Sign in at the admin host as the newly promoted
  **organizer**. **PASS**: the report queue is nowhere — no navigation entry, and its direct
  address refuses without confirming the queue exists.
- **A6 — No route acts on a person** *(US3 scenario 4)*. As operator, enumerate every navigable
  administrative surface. **PASS**: nothing suspends, removes, restricts, mutes or edits an
  **attendee**; no profile field is editable at any tier. Record the list of surfaces visited.
- **A7 — Refusals are indistinguishable** *(013/2)*. At admin sign-in try: a wrong password for a
  real operator, an unknown address, and (if one exists) a deactivated operator. **PASS**: one
  identical refusal, three times.

## Part B — The organizer journey (US2)

*Authors the conference Part C walks. Every 014 scenario authored into a seeded conference;
decision 47's create-from-zero capability has been exercised by nothing — until B2.*

- **B1 — Promotion changed nothing observable in MyNet** (FR-970–FR-984). Open MyNet as the
  promoted organizer. Walk all five destinations. **PASS**: no admin affordance, no privileged
  view, no role-dependent rendering — indistinguishable from before A4.
- **B2 — Seam S8: a conference from zero.** As the organizer, create a new conference (name,
  venue timezone, days). Author: two tracks, two rooms, two speakers, and at least six sessions
  across two days — one session **optional with capacity 2** and a relative closing offset, one
  with no speaker. **PASS**: the programme renders in the admin views exactly as authored; the
  join code is displayed. *(Every admin edit in this part crosses a real browser's CORS
  preflight — seam S13, which `fastify.inject()` can never perform. An opaque network error on
  any edit is the T202 defect class; record it immediately.)*
- **B3 — A real attendee joins from nothing.** In the walker's own profile: sign up with the
  real-inbox address, receive the verification mail, **click the link** (this also completes
  012's T006), join B2's conference by its code. **PASS**: arrival at the conference, greeted by
  name, told which day it is in the venue's timezone. *(Rewrites 001/5's expectation: the
  install icons are 010/016's real brand mark now, NOT "visibly provisional" placeholders.)*
- **B4 — Content is live-edited** (decision 48). Edit a session's summary as the organizer.
  **PASS**: the attendee sees the change on their next read; there is no draft state and no
  publish step anywhere.
- **B5 — The second notification trigger, coalesced** *(014/6, 014/7)*. Have the attendee SAVE
  two sessions. As organizer, in one editing session change one saved session's **room** and the
  other's **start time**. **PASS**: the attendee receives **one** notification whose body carries
  a count; activating it lands on the destination carrying **per-row markers** on exactly those
  two rows — never on a list of changes; **no view in either product shows a count of changes**.
- **B6 — Cancellation, and the one surface that omits it** *(014/3, 014/4)*. Cancel a session
  the attendee has saved. **PASS**: the cancelled state is visible on the programme, the Agenda
  row, the panel and the rest-of-day timeline — and **"Up next" alone omits it** (it answers
  "where do I go now"); the rest-of-day timeline deliberately still shows it.
- **B7 — Delete is fenced by engagement** *(014/2, decision 49/51)*. Try to delete: (a) an
  untouched session — **PASS**: deleted; (b) a session with a save/note/question — **PASS**:
  refused, and the refusal says to **cancel instead, everything they wrote stays where it is**;
  (c) the optional session while places are held — **PASS**: permitted, and the dialog states
  the number of places held and that **nobody will be told** (decision 51's ratified cost).
  *(Perform (c) only after C-part enrolment assertions are done, or re-author it.)*
- **B8 — Full and closed are different sentences** *(014/10, 014/11)*. With two attendee
  profiles, enrol both into the optional session (capacity 2); attempt a third enrolment.
  **PASS**: the refusal says the session is **full**. After the closing offset passes (or with a
  session authored to close sooner): **PASS**: that refusal says **closed** — verify the two
  sentences differ.
- **B9 — The roster, and what it must not show** *(014/14)*. As the assigned organizer, open the
  optional session's roster. **PASS**: enrolled attendees are named — and nothing else of theirs
  is: no saved sessions, no notes, no questions, no votes, no route into a profile. The attendee
  side said enrolment discloses the name **before** they enrolled.
- **B10 — A virtual conference** *(014/15)*. Set the event's modality to virtual with an
  `https:` access link; as attendee confirm the link renders where a room would; an `http:` link
  is refused at authoring. **PASS** as stated.

## Part C — The attendee journey (US1)

*The core journey, on the conference B authored. SC-1201: complete it on a phone the walker
owns, working only from this script. It ends at a scheduled meeting (C8).*

- **C1 — The five destinations, including every empty state.** With the fresh real-inbox
  account: walk Home, Agenda, Discover, Messages, Network. **PASS**: Home shows the up-next
  card, rest-of-day timeline, recommended people, appointment summary and (later) unread
  indicator; empty Agenda invites exploring the programme; an empty Discover search shows the
  no-results state **with a reset-filters action**; empty Messages shows the conversation-starter
  prompt; empty Network explains contacts arrive by exchanging cards. Each destination is
  individually addressable (open each by URL). Then, with an account registered for more than
  one conference (Ada, or after joining a second), **switch conferences**: **PASS**: every
  surface follows at once — no surface anywhere still shows the previous conference (002/3).
- **C2 — Build an agenda; the panel; notes** *(005/1–3 spot-walk)*. Save three sessions; open a
  session panel: Overview, private Notes (type — "Saved." appears; the text survives leaving and
  returning), Q&A section (marked: 017 surface), Speaker info. Remove one saved session.
  **PASS** as stated; the All/Saved filter agrees with what was saved.
- **C3 — Discover narrows and respects visibility** *(006/2a, 2b)*. Search by name fragment;
  filter by role and by interest; **PASS**: results narrow accordingly, cards carry company,
  role, interests, intent, availability. Turn discoverability OFF on the second profile;
  **PASS**: they vanish from the directory on the next request — and a held card (after C5)
  still resolves them (standing consent). An **unverified** account appears to nobody.
- **C4 — The unverified account is a complete product** *(004/2 half)*. Before clicking the
  verification link on some throwaway account: everything works except discoverability.
  **PASS**: no surface nags beyond the verification notice; nothing else is gated.
- **C5 — The mutual exchange, and its sentence** *(016/5 — where FR-1055's defect lived)*.
  From profile A share a card with B. **READ THE CONFIRMATION COPY ALOUD.** **PASS**: it says
  both parties now hold each other's card — one act, both directions; **any wording implying
  one-directional sharing is a defect**. Both Networks show the contact. A held card resolves
  the **live** profile: B edits their role; A's held card shows the new role.
- **C6 — Messages** *(007/1, 007/2, 016/1–3)*. Open a conversation from Discover — no request,
  no acceptance. Hold a conversation from both profiles; **PASS**: the thread updates within
  ~3–5s while visible; the list catches up within ~15s; Home's unread indicator appears for the
  recipient and clears on reading. Type a 40-word message in the composer at desktop width:
  **PASS**: the composer stays bounded, the send control never occluded (the phone-keyboard half
  is D8).
- **C7 — Push, both answers** *(007/4, 007/5, 014/8)*. On profile 1: the permission prompt
  **explains before asking**; **deny** — **PASS**: the product is complete, nothing degrades,
  and it never asks again. On profile 2 (real browser profile, not incognito): grant; close the
  tab; send a message from profile 1. **PASS**: an OS notification arrives with the app closed;
  activating it opens that conversation.
- **C8 — A meeting is scheduled — SC-1201's endpoint** *(008/3, 008/4)*. From B's card or
  profile, open the scheduling modal. **PASS**: it is **centred with comparable space either
  side** (the 008 top-left defect class — look, do not assume); the slot grid reflects only the
  **reader's own** commitments (the invitee's diary discloses nothing by omission); propose with
  a short topic. On B's side: **the Home card is the only place the proposal appears** — no
  notification, no bell. Accept it. **PASS**: both sides show the confirmed appointment in
  Network and Home's summary. Attempt a double-booking acceptance: **PASS**: the one refusal
  that carries a reason, describing the reader's own diary.
- **C9 — Seam S5: a report crosses three features' surfaces, end to end — never before walked.**
  From profile A, report a message of B's (and note reporting **blocks in the same action**).
  Then: (1) the operator mail arrives at `apps@programasemilla.com` carrying identifiers and a
  timestamp, **never message text**; (2) the admin report queue shows the reported content and
  the reporter's stated reason to the **platform operator** (A5 proved the organizer cannot see
  it); (3) resolve it; (4) **the reporter is told nothing** — their view never changes, no
  status, no acknowledgement beyond submission. **PASS**: all four, in order.
- **C10 — Blocking severs and lifting restores — except the appointment** *(007/3, 008/6)*.
  While A blocks B (from C9): **PASS**: B's sends are refused **without a reason** (a bare
  refusal); B cannot schedule with A; each is filtered from the other's directory; an accepted
  appointment between them is **cancelled**. A lifts the block: **PASS**: the conversation and
  held cards restore with no repair step — and the cancelled appointment **stays cancelled**.
- **C11 — Q&A as shipped** *(009/1–3, marked as 017's surface)*. Ask a question on a session:
  **PASS**: published instantly to every registered attendee under the author's **full name**
  (today's shipped attribution — v5.4.0 R2's "Ana R." arrives with 017); upvote from the second
  profile — ordering updates without focus loss; the author cannot vote their own question
  (explained refusal); withdrawal is offered while voteless and refused with an explanation once
  voted. Then: **report the question from the question itself** — no conversation needed
  (FR-781) — and, as the platform operator, remove it from the queue (013/5). **PASS**: the
  question and every vote on it are gone from every attendee's view, and the reporter is told
  nothing.
- **C12 — Offline, honestly, in session** *(005/4, 002/6, 008/Offline)*. On the walker's phone,
  mid-session, enable airplane mode. **PASS**: Agenda stays readable **with a retrieval stamp**
  ("last updated…"); a save attempt is refused with "needs a connection… nothing has been
  queued"; a note keeps its text on screen with the refusal; Discover and Messages refuse
  honestly (no stale directory, no stale thread); Network's cached appointments show their
  stamp. Reconnect: **PASS**: recovery without a manual reload.
- **C13 — The offline cold start now refuses — and that is 012's own change** (SC-1207,
  decision D-012-1). Still offline: force-close the app and reopen it. **PASS**: the signed-out
  degraded state — **no name, no programme, no notes, no retrieval stamp**; the previous
  session's content is NOT served. *(Rewrites 005/4's old expectation: an offline cold start
  used to read the programme; the entry that made that work is the one that disclosed it to
  whoever held the device.)*
- **C14 — Export, and the account surfaces** *(004/3, 004/6, 016/4)*. Edit the profile (fields,
  interests from the taxonomy, intent, availability); upload an avatar from a phone photo —
  **PASS**: it renders resized, and the downloaded copy carries **no GPS EXIF**. Export personal
  data: **PASS**: machine-readable, and spot-check it carries the profile, notes, questions and
  messages just created. Password fields on **both products** carry a working reveal control
  whose toggle does not submit the form.

## Part D — Layouts and devices (US4, US5)

*The one class of defect no automated gate can see. Every step here carries a capture.*

- **D1 — MyNet at 390, 768 and 1280.** Every destination, the session panel, and every open
  dialog, at each width. **PASS** per surface: every primary action reachable; **no content and
  no primary action requires horizontal scrolling** (scroll INSIDE a declared container is fine —
  the sweep already measures that; your eyes are here for what it cannot see: overlap, clipping,
  absurd spacing, truncation that matters). Bottom navigation below 768; icon rail 768–1279;
  full rail at 1280. **Capture each width per destination.**
- **D2 — The admin site at 390, 768 and 1280 — never reviewed at any width.** Every
  administrative surface. **PASS**: **three distinct layouts** (US4 scenario 3). *Known
  carve-out (v5.4.0 R3): `AdminShell` shipped with two — below 768 its only navigation is a
  horizontally scrolling strip. If that is still what renders, it is a **defect to record and
  fix** (FR-1130), not a surprise.* **Capture each width.**
- **D3 — Every modal, centred** *(the 008 defect class)*. Open every dialog both products offer
  (confirms, scheduling, admin dialogs, withdrawal confirmation) at each width. **PASS**:
  centred with comparable space either side. **Capture any that look wrong.**
- **D4 — The 768–1279 divergence is present and CORRECT.** Side by side at 900px: MyNet shows an
  icon-only rail; the admin site a labelled one. **PASS**: they differ. R3 ratified the
  divergence — a finding that they "should match" is a **decision** under FR-1131, not a defect.
- **D5 — Seam S11: one small top bar, five tenants.** At 390px on UAT: the environment marker,
  the brand mark, the event switcher and the product name compete for one bar. **PASS**: the
  marker is legible and controls work. *The product name truncating to "M…" is **known and
  accepted** (pre-010 state, entry 4 closed by R3) — record what renders; do not file it as
  new.* **Capture.**
- **D6 — The five authentication screens** *(010/8)* at three widths, with the mark beside live
  text. **PASS**: mark renders (not stretched, not clipped), no layout break. **Capture.**
- **D7 — The tab strip at 16px** *(010/6)*. **PASS**: the favicon is recognisable at real tab
  size next to a dozen other tabs. **Capture.**
- **D8 — The physical iPhone** (FR-1122, 016's T068). On a real iPhone in Safari: the sign-in
  screen explains what installing buys **before** installation; install using Safari's own
  affordance (share sheet → Add to Home Screen — the product cannot prompt; **PASS** is that its
  guidance matches what Safari actually shows). Launch from the home screen. **Judge the icon**
  beside the in-app coral mark and record the judgement **against register entry 28 — it is a
  decision record, not a defect** (SC-1205). Retype C6's 40-word message with the **real
  on-screen keyboard**: **PASS**: composer bounded, send control never occluded. **Photograph
  the home screen.**
- **D9 — The physical Android phone** (FR-1123, SC-1206). Install via the `beforeinstallprompt`
  banner. **Photograph the home screen beside the in-app mark** (SC-1205's other half). Then,
  with this phone's attendee holding a saved session in B2's conference and permission granted:
  the organizer walker changes that session's room. **PASS**: a real push notification arrives
  on the phone; **activating it lands on the destination carrying the per-row marker** — not on
  any list of changes.
- **D10 — Seam S12: the worker does not annex the admin site.** On a device with MyNet
  installed, browse to `admin.mynet-dev.programasemilla.com`. **PASS**: the admin site loads as
  its own document — the root-scoped MyNet service worker does not intercept the navigation.
- **D11 — Screen reader** (FR-1124, seam S14). With VoiceOver (iPhone) or NVDA/Orca: the five
  auth screens and one destination per product. **PASS**: every control announces a name; focus
  is visible and ordered; the session panel traps focus and Escape closes only the top dialog;
  crossing from MyNet to the admin site announces a comprehensible page identity.
- **D12 — Zoom and motion** *(001/4's residual)*. 200% text zoom on one destination per product:
  **PASS**: reflow without loss. OS reduced-motion: **PASS**: non-essential animation stops.

## Part E — Destructive, last

- **E1 — Seam S2: delete the person who is everything at once.** By now one attendee (the
  promoted organizer from A4/B, if the walk built them up — otherwise build up: ensure they are
  simultaneously **organizer, contact, conversation participant, question author, place-holder
  and report subject**). Self-serve delete that account. **PASS**, each verified separately:
  - their organizer assignments are revoked in the same act; a conference left with no
    organizer shows **`unassigned`** to operators — it does not silently revert to the platform;
  - the counterpart keeps a one-sided, read-only thread with **no name, no avatar, no
    identifier** (`counterpart: null`); a conversation nobody is left in is gone entirely;
  - held cards vanish from **both** Networks (no one-sided survivor);
  - appointments are gone; any live meeting they held at any conference is cancelled for the
    other party (not stranded);
  - their questions are gone **with everybody's votes on them** — no placeholder, no tombstone;
  - their held place is released;
  - the report about them survives in the queue as **`content unavailable`** — a first-class
    state, not an error;
  - signing up afresh with the same address works.

## Part F — Discharged, blocked, or machine-covered (walk nothing here; verify the ledger)

- **006/3d and 011/8 (backup and restore on the real host): DISCHARGED 2026-08-16** by 012's
  implementation — see `deploy/vm/OPERATIONS-LOG.md`: off-host copy confirmed, cron proven to
  fire, restore exercised on the host.
- **011/9 steps 1–4 (CI deploys on merge): RETIRED BY DECISION D-012-4** (owner, 2026-08-16) —
  UAT is deployed by hand via `deploy/vm/deploy.sh`; the mechanism those steps describe is one
  the owner decided against, and FR-1120a was amended to say so. Steps 5–7 (the door closes
  behind a deploy) remain walkable at any hand deploy. Recorded per SC-1202.
- **006/3a–3c, 3e**: 3a's two owner decisions landed (v3.5.0); 3b was performed by 011 (the
  environment exists); 3c's checks are one command (`deploy/vm/README.md` §4) — run them once
  during Part A and record; 3e (rollback) is deliberately not walked against the shared walk
  database — record as deferred-to-production-runbook.
- Everything marked **retired** in Appendix A names the automated coverage that replaced it.

---

*Appendix A — the ledger of all 136 enumerated walk units — follows. Every unit carries exactly
one disposition: `walked → <step>`, `retired → <coverage>`, `done (own feature)`, `blocked`, or
`deferred`, per SC-1202.*

---

## Appendix A — the ledger (SC-1202: every enumerated walk unit, one disposition each)

**136 units.** `walked → <step>` names the step above that carries the coverage now;
`retired → <coverage>` names the automated gate that replaced it (nothing whose subject is
position, size, colour, legibility or copy was retired — research R1's rule); `done` means the
owning feature walked it and marked its task complete; `blocked`/`deferred`/`spent` say why and
are re-examined at close. Task-status column reflects the owning feature's tasks.md at
derivation time.

| Unit | Title | Own-feature status | Disposition |
|---|---|---|---|
| `001/Verify everything` | Verify everything (pnpm verify and the individual gate commands) | complete | retired → pnpm verify / the ten CI gates |
| `001/1` | Sign in and see your own workspace | complete | done (own feature, 001/T109) — kept as a one-minute smoke inside B3/C1 |
| `001/2` | One attendee cannot see another's data | complete | retired → the isolation integration suite and the three route audits |
| `001/3` | Navigate on every device | complete | retired → e2e/responsive.spec.ts + the accessibility job; keyboard residual walked at D11 |
| `001/4` | Accessibility | complete | retired (axe half → CI accessibility job); by-hand residual walked at D12 |
| `001/5` | Install and behave honestly offline | complete | walked → B3, C12, D8 (expectation REWRITTEN: real brand icon, not "visibly provisional") |
| `001/6` | Session expiry | complete | retired → session-expiry integration tests; on-screen wording spot-checked at A2 |
| `001/7` | Sign-in throttling | complete | retired → throttle integration tests; Part 0 carries the walker guidance (S15) |
| `001/8` | The pipeline actually catches things | outstanding | deferred — this is 001/T093 (break every gate on purpose); it stays OPEN with 001 (012/T098 annotates rather than ticks) |
| `001/9` | Clean-clone reproducibility | complete | done (own feature, 001/T109) |
| `002/1` | Arrive at the right conference, with real day context | outstanding | walked → B3 |
| `002/2` | See what is happening next, and the whole programme | outstanding | walked → C1, C2 |
| `002/3` | Switch, and watch everything follow | outstanding | walked → C1 (the switch sub-assertion) |
| `002/4` | Isolation, which is the one that must not be waved through | outstanding | retired → isolation integration suite + event-scope route audit |
| `002/5` | A broken card does not take Home down | outstanding | retired → Home card-composition component tests (decision 9 guards) |
| `002/6` | Offline, honestly | outstanding | walked → C12, C13 |
| `002/7` | Keyboard and layout | outstanding | walked → D1, D11 |
| `002/8` | The split changed nothing | outstanding | spent — a one-time proof at 002's merge; nothing left to walk |
| `002/Full gate` | Full gate (pnpm verify:clean) | complete | retired → pnpm verify:clean / CI |
| `004/1` | A person becomes an attendee | outstanding | walked → B3 |
| `004/2` | Verification and recovery | outstanding | walked → B3 (verify link), C4 |
| `004/3` | The profile | outstanding | walked → C14 |
| `004/4` | The avatar | outstanding | walked → C14 (EXIF assertion included) |
| `004/5` | Discoverability | outstanding | walked → C3 |
| `004/6` | Export | outstanding | walked → C14 |
| `004/7` | Deletion — the one that closes 005's open loop | outstanding | walked → E1 |
| `004/8` | Isolation | outstanding | retired → isolation integration suite |
| `004/9` | Offline | outstanding | walked → C12 |
| `004/10` | Retention | outstanding | retired → retention-sweep tests (not observable by hand) |
| `004/Gates` | Gates (lint, typecheck, test, contract:check, build) | complete | retired → CI |
| `005/The gates, locally` | The gates, locally | complete | retired → CI |
| `005/1` | Scenario 1 — Build an agenda (US1) | complete | done (own feature, 005/T091) |
| `005/2` | Scenario 2 — The detail panel (US2) | complete | done (own feature, 005/T091) |
| `005/3` | Scenario 3 — Notes (US3) | complete | done (own feature, 005/T091) |
| `005/4` | Scenario 4 — Offline (US4) | complete | done (own feature, 005/T091) — cold-start half REWRITTEN by C13 (SC-1207) |
| `005/5` | Scenario 5 — Isolation (US5) | complete | done (own feature, 005/T091) |
| `005/6` | Scenario 6 — Home composition (US6) | complete | done (own feature, 005/T091) |
| `005/Responsive and accessibility` | Responsive and accessibility | complete | done (own feature) — re-seen at D1/D11 |
| `006/Part 1` | Part 1 — the whole pipeline, locally, on a clean database | outstanding | retired → pnpm verify:clean (machine end to end) |
| `006/2a` | 2a — the directory renders and narrows | outstanding | walked → C3 |
| `006/2b` | 2b — visibility, which is the part worth being careful about | outstanding | walked → C3 |
| `006/2c` | 2c — avatars in one request | outstanding | retired → avatar single-request assertions (e2e) |
| `006/2d` | 2d — paging without duplicates | outstanding | retired → keyset-pagination integration tests + useDirectory dedup unit test (UAT population too small to page by hand) |
| `006/2e` | 2e — the profile view | outstanding | walked → C3, C5 (expectation REWRITTEN: card exchange is mutual since v5.0.0 C1/016) |
| `006/2f` | 2f — Home | outstanding | walked → C1 |
| `006/2g` | 2g — offline | outstanding | walked → C12 |
| `006/2h` | 2h — accessibility and layout | outstanding | retired → accessibility job; layouts walked at D1 |
| `006/3a` | 3a — blocked until two owner decisions land | outstanding | done — both owner decisions landed in v3.5.0 |
| `006/3b` | 3b — provision and deploy, per environment | outstanding | done — 011 provisioned and deployed the environment |
| `006/3c` | 3c — what to check on a deployed environment | outstanding | walked → F (the one-command deployed-environment check, run during Part A) |
| `006/3d` | 3d — backup and restore, before production holds real data | outstanding | discharged 2026-08-16 by 012 implementation — OPERATIONS-LOG (restore on the real host) |
| `006/3e` | 3e — rollback | outstanding | deferred → production runbook (a rollback against the shared walk database would destroy Part B's fixtures) |
| `006/Part 4` | Part 4 — the debt | outstanding | retired — the debt ledger it describes is superseded by 012 itself |
| `007/1` | Scenario 1 — reach someone you just found (US1) | outstanding | walked → C6 |
| `007/2` | Scenario 2 — hold a conversation (US2) | outstanding | walked → C6 |
| `007/3` | Scenario 3 — stop unwanted contact (US3) | outstanding | walked → C10 |
| `007/4` | Scenario 4 — know something is waiting (US4) | outstanding | walked → C6, C7 |
| `007/5` | Scenario 5 — be reached when the app is closed (US5) | outstanding | walked → C7, D9 |
| `007/6` | Scenario 6 — a conversation outlives the other person (US6) | outstanding | walked → E1 |
| `007/Full verification` | Full verification | outstanding | retired → CI |
| `008/1` | Keep someone you just met (US1) | outstanding | walked → C5 (expectation REWRITTEN: both Networks change — the mutual exchange, the exact opposite of the retracted sentence) |
| `008/2` | A relationship that outlives the conference (US2) | outstanding | walked → C5 (held card resolves live profile under standing consent) |
| `008/3` | Propose a meeting (US3) | outstanding | walked → C8 |
| `008/4` | Answer a proposal (US4) | outstanding | walked → C8 |
| `008/5` | Home tells you (US5) | outstanding | walked → C8 (the Home card is the only channel) |
| `008/6` | Ending it (US6) | outstanding | walked → C10, E1 |
| `008/Offline` | Offline (unnumbered section) | outstanding | walked → C12 |
| `008/Layouts and accessibility` | Layouts and accessibility (unnumbered section) | outstanding | walked → D1, D3 |
| `008/Automated equivalents` | Automated equivalents (unnumbered closing section) | complete | retired → the named automated suites |
| `009/1` | Ask, and be seen (US1) | outstanding | walked → C11 (as-shipped surface; 017 note in Part 0) |
| `009/2` | Ranking (US2) | outstanding | walked → C11 |
| `009/3` | Withdrawal, and its cut-off (US3) | outstanding | walked → C11 |
| `009/4` | Report, and disappear (US5) | outstanding | walked → C11 (report-from-question, FR-781, + operator removal) |
| `009/5` | Leaving (US4) | outstanding | walked → E1 |
| `009/6` | Layout, focus and the two dialogs | outstanding | walked → D3 (the nested-dialog Escape assertion included in D11 focus checks) |
| `009/7` | Offline | outstanding | walked → C12 |
| `009/8` | Scoping and refusals | outstanding | retired → qa-absences + scoping suites |
| `009/Automated gates` | Automated gates (unnumbered closing section) | complete | retired → CI |
| `010/1` | The pipeline is deterministic (FR-806, SC-809) | complete | retired → brand-audit.mjs (byte-identical regeneration) |
| `010/2` | A declared icon with no file fails (FR-832, FR-833, SC-810) | complete | retired → brand-audit.mjs (declared icon with no file fails) |
| `010/3` | Nothing else regressed (SC-807, SC-811, SC-812) | complete | retired → CI |
| `010/4` | Screenshots stay out of the install download (FR-815d) | complete | retired → brand-audit.mjs precache assertions (expectation note: install icons derive from new-logo.png since 016) |
| `010/5` | Install it and look at it (FR-810–FR-812, SC-801, SC-802, SC-803) | outstanding | walked → D8 (expectation REWRITTEN: the 016 install icon, judged against register entry 28 — divergence from the in-app mark is recorded, not a defect) |
| `010/6` | The tab strip (FR-816–FR-818a, SC-804) | outstanding | walked → D7 |
| `010/7` | The mark in the shell, at all three widths (FR-822–FR-827, SC-805, SC-80 | outstanding | walked → D1, D5, D6 |
| `010/8` | The five authentication screens (FR-826, SC-808) | outstanding | walked → D6 |
| `010/9` | Screen reader (FR-821, SC-807) | outstanding | walked → D11 |
| `010/10` | Offline (Principle VI declaration) | complete | retired → declaration (no offline behaviour to walk) |
| `011/1` | The abuse surface is closed (local, gates the deploy) | outstanding | retired → the pre-deploy local gates |
| `011/2` | Mail is real, and the sink refuses production (local, gates the deploy) | outstanding | retired → mail-adapter gates (and B3 proves real delivery) |
| `011/3` | Configuration fails at the point that names it (local, gates the deploy) | outstanding | retired → config-refusal tests |
| `011/4` | The environment is reachable over a trusted certificate | outstanding | walked → A1, B3 (every request in the walk rides the trusted certificate) |
| `011/5` | Somebody can create an account and use it | outstanding | walked → B3 |
| `011/6` | The environment says it is not production | outstanding | walked → D5 (the UAT marker) |
| `011/7` | Notifications and reports leave the box | outstanding | walked → C7, C9, D9 |
| `011/8` | A backup that outlives its host, and a restore that has been done | outstanding | discharged 2026-08-16 by 012 implementation — OPERATIONS-LOG (off-host copy + cron proven + restore) |
| `011/9` | Delivery is automatic, and the door closes behind it | outstanding | retired-by-decision (steps 1–4): D-012-4 — UAT is hand-deployed, FR-1120a amended; steps 5–7 walkable at the next hand deploy (SC-1202) |
| `013/1` | Sign in, and the second actor exists | outstanding | walked → A1 |
| `013/SC-900 — sign-in to queue, measured (T153)` | SC-900 sign-in-to-queue timing, measured | complete | retired → measured once at 013 (SC-900) |
| `013/2` | Refusals are indistinguishable | outstanding | walked → A7 |
| `013/3` | Two independent sessions | outstanding | walked → A2 |
| `013/4` | The report queue, and the promise becomes true | outstanding | walked → C9 |
| `013/5` | Removing an abusive question | outstanding | walked → C11 (operator removal) |
| `013/6` | The tier boundary is real | outstanding | walked → A5 |
| `013/7` | Leaving takes the authority | outstanding | walked → E1 (authority ends with access; unassigned state) |
| `013/8` | The admin site at three widths | outstanding | walked → D2 |
| `013/9` | Keyboard and screen reader | outstanding | walked → D11 |
| `013/10` | Session bounds | outstanding | walked → A2 (session bounds) |
| `013/11` | MyNet is unchanged | outstanding | walked → B1 |
| `013/Machine gates that must be green alongside this` | Machine gates (pnpm verify, pnpm test:a11y, named failing-loudly guards) | complete | retired → CI + the named failing-loudly guards |
| `014/1` | Author a programme | complete | done (own feature, 014/T104 machine walk) |
| `014/2` | Delete is available only while untouched | complete | done (014/T104) — refusal sentence re-read at B7 |
| `014/3` | Cancellation preserves everything | complete | done (014/T104) — re-walked by hand at B6 |
| `014/4` | Up next skips a cancelled session | complete | done (014/T104) — re-walked by hand at B6 |
| `014/5` | The race (FR-1019a) | complete | retired → the three-attendees-race e2e (T202) |
| `014/6` | Notification for a saved session | outstanding | walked → B5 |
| `014/7` | Coalescing, and the absence it must not become | outstanding | walked → B5 |
| `014/8` | Denied permission is a complete product | outstanding | walked → C7 (the denied half) |
| `014/9` | The three widths, and a screen-reader pass (tranche 1) | outstanding | walked → D1, D11 |
| `014/10` | A place is taken, and the last one is contested | outstanding | walked → B8 |
| `014/11` | Full and closed are different sentences | outstanding | walked → B8 |
| `014/12` | Enrolment replaces saving | outstanding | walked → B8 (enrolling replaces saving, observed on the Agenda row) |
| `014/13` | A held place is notified, and deletion is silent | outstanding | walked → B7(c) (the silent deletion, dialog read aloud) |
| `014/14` | The roster, and what it must not show | outstanding | walked → B9 |
| `014/15` | A virtual conference | outstanding | walked → B10 |
| `014/16` | The vocabulary, empty and then filled | outstanding | walked → C14 (the taxonomy in the profile editor) |
| `014/17` | The three widths, and a screen-reader pass (tranche 2) | outstanding | walked → D1, D2, D11 |
| `016/1` | The composer stays usable | outstanding | walked → C6 (desktop half), D8 (real keyboard half) |
| `016/2` | The conversation list stays current | outstanding | walked → C6 |
| `016/3` | The list pauses when it is not on screen | outstanding | retired → useDisplayed unit tests + FR-1054 guards (not reliably observable by hand) |
| `016/4` | Passwords, on both products | outstanding | walked → C14 (both products) |
| `016/5` | Cards exchange mutually | outstanding | walked → C5 |
| `016/6` | Install guidance | outstanding | walked → D8 (pre-install guidance) |
| `016/7` | Icons and marks | outstanding | retired → brand-audit.mjs (two disjoint pipelines) |
| `016/8` | On a physical phone (SC-1009) — NOT AUTOMATABLE | outstanding | walked → D8, D9 (SC-1009 — the reason this walk exists) |
| `016/9` | Atomicity under failure (SC-1007) — needs fault injection | outstanding | retired → cards-atomicity.test.ts (real BEFORE INSERT trigger fault injection) |
