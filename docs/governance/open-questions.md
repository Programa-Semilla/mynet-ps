# Open questions register

**A living record, not governance** (constitution I.3, G.5). Recorded discrepancies and undecided
matters. **Adding an entry is always permitted; closing one requires a recorded owner decision**
(`decisions.md`), and a decision that changes a constitutional rule is also an amendment. A feature
blocked on an entry MUST say so in its Feature Declarations. **Do not resolve an entry silently.**

Moved out of the constitution in v6.0.0 (2026-09-24). Entries are listed once, in number order, with
their **current** status. Every entry's original wording, escalations and annotations are preserved
verbatim in `docs/record/constitution-history.md`, Part 2. Where a summary here and the constitution
disagree about a rule, the constitution wins.

_Numbering is stable._ Resolved entries are struck through in place, never removed or renumbered. A
new entry takes the next number after **31**, checked against every branch in flight (constitution
W.3). "Binding text" pointers below name constitution sections **as they were before v6.0.0**; the
full text of those sections is Part 3 of the history.

**Open — require a client decision**

1. **What "PS" denotes** in the repository name `mynet-ps`.
2. ~~**Real brand mark and application icons.**~~ **RESOLVED 2026-08-10 in 3.4.0** — the owner
   supplied a brand board. Binding text: "Brand identity and application icons".
3. **`GroundZero/requirements.md` is now knowingly out of step** with this constitution on product
   name, delivery mode, persistence, authentication, and routing. Whether it is amended or the
   divergence is recorded is undecided.
4. ~~**Desktop and tablet layouts have never been validated by the client.**~~ **RESOLVED
   2026-08-15 in 5.4.0 by R3 — CLOSED BY OWNER RATIFICATION, without a client acceptance act.**
   **Not a claim that the layouts were validated**, and specifically not a claim that green gates
   validated them: 5.0.0's rule on that stands unamended. Ratified as-is: the 768–1279px rail
   divergence between the two products, and Home's two-column cards on an upright tablet. **Carved
   out as a defect rather than ratified**: `AdminShell` presenting two layouts where Principle IV
   requires three. Escalated three times (3.4.0, 4.0.0, 5.0.0) before closing.
5. ~~**Attendee identity model.**~~ **RESOLVED 2026-08-07 in 2.3.0 by D5** — self sign-up with an
   event join code. Binding text: "Attendee identity, personal data, and profile".
6. ~~**Data retention, deletion, and export obligations.**~~ **RESOLVED 2026-08-07 in 2.3.0 by D6**
   — full self-serve: hard deletion with cascade and no tombstone, machine-readable export, and a
   retention clock for what no cascade reaches. Binding text: Principle VIII.
7. ~~**The connection model behind Network contacts.**~~ **RESOLVED 2026-08-10 in 3.2.0** — a
   contact is someone whose digital business card you hold; no connect verb, no accept step, and
   contacts MUST NOT be derived from conversations. Binding text: "Networking relationships and
   appointments".
8. ~~**What an exchanged digital card records, and whether the exchange is mutual.**~~ **RESOLVED
   2026-08-10 in 3.2.0 (N2)** as one-directional, recording the exchange rather than the person —
   **and that answer was REVERSED 2026-08-12 in 5.0.0 by C1: sharing is a mutual exchange.**
   Binding text: "Networking relationships and appointments".
9. ~~**Audience-question attribution.**~~ **RESOLVED 2026-08-10 in 3.2.0** — questions are
   attributed, making Q&A a personal-data surface under Principle VIII. _The rendered form was later
   settled by entry 27._ Binding text: "Audience questions".
10. ~~**Notifications.**~~ **RESOLVED IN PART 2026-08-08 in 3.1.0 by M4** — delivery enters scope
    for a received message; **the bell and an in-app notification centre remain forbidden**, which
    is why it is resolved _in part_. Widened by 5.2.0 (N1) to a second, enumerated trigger. Binding
    text: "Notification delivery". Created entry 20.

**Open — require an owner or planning decision**

11. ~~**API hosting, the managed PostgreSQL provider, and object storage.**~~ **RESOLVED 2026-08-07
    in 3.0.0 by D12** — two isolated Azure VMs, each running Caddy in front of an API container and
    a loopback-only PostgreSQL container, with `StorageService` on a host volume. **Annotated in
    3.5.0 by L3** with the subscription it never named: `d428f98f-a3c4-49c3-ae24-06ec3de08477`
    (LinaSys-DevEnv), `centralus`. Binding text: "Deployment environments".
12. **Authentication ownership** — self-implemented versus a delegated provider. _Still open, and
    worth stating what "open" now means_: authentication is self-implemented and has been shipped
    since 004. The question is whether that is the settled answer or an unratified default, and
    nothing is blocked on it.
13. ~~**Attendee avatar handling.**~~ **RESOLVED 2026-08-07 in 2.3.0 by D7** — real upload, with
    resizing and EXIF stripping mandatory.
14. ~~**Public non-production URLs.**~~ **RESOLVED 2026-08-10 in 3.5.0 by L1** —
    `mynet-dev.programasemilla.com`, openly reachable, **seeded data only**; FR-067 is satisfied by
    the data rather than by the door. Basic auth and an IP allowlist were rejected as safer-looking
    but worse. Binding text: "Deployment environments". _Did not resolve entry 19, and escalated it._
15. **Server-side branch protection is unconfigured** — a configuration task, not an accepted risk.
    _Corrected 2026-08-07_: this entry previously recorded it as "unavailable (private repository,
    free personal account; APIs return 403)". **Both halves were wrong.** The repository is public
    and organisation-owned; the protection endpoints return **404 — no rule set** — and `rulesets`
    returns an empty list. Branch protection is free on public repositories. Until it is applied,
    enforcement is client-side only and bypassable with `--no-verify`.
16. **The repository is public and organisation-owned** — `Programa-Semilla/mynet-ps` — and nothing
    in this constitution recorded that. Whether it was intended, or is an artifact of how the
    repository was created, is undecided. It changes the Principle VIII threat model either way:
    committed seed data, migrations, workflow configuration, and the generated API contract are all
    world-readable, and preview deployments are reachable by anyone who finds them. This interacts
    with entry 14. _Added 2026-08-07_.
17. ~~**The pipeline runs red, and most of the checks Principle VII names have never executed.**~~
    **CLOSED 2026-08-07 in 3.0.0** — substantially closed by 005 and PR #9 (the database gates moved
    to per-job PostgreSQL service containers and ran for the first time), and the remainder resolved
    **by replacement** under D13: the four preview-path jobs were deleted, not provisioned. **Zero
    correctness checks were weakened, disabled, or made non-blocking.** What is given up is recorded
    under Principle VII.
18. ~~**The transactional email provider.**~~ **RESOLVED 2026-08-10 in 3.5.0 by L4: Mailgun.**
    `MailService` stays a vendor-free port with the adapter selected by configuration identically in
    every environment, and the SDK stays confined to `apps/api/src/mail/`. **Real mail is not
    optional for a usable environment**: verification gates discoverability.
19. **Nobody moderates uploaded avatar images.** _Added 2026-08-07. ADDRESSED, NOT CLOSED._ Public
    self sign-up (D5) plus image upload (D7), shown by default in a directory to every attendee of a
    conference (006), in a thread header to anybody who opens a conversation (007), on a permanent,
    openly reachable UAT (3.5.0, L1). **4.0.0 (A1) reversed the exclusion that foreclosed the usual
    answer, and 013 built the first actor capable of acting on an uploaded image — but a capability
    is not a policy**: who moderates, against what standard, on whose complaint, with what appeal,
    and whether a removed avatar is replaced or blanked are all undecided. Bounded meanwhile by UAT
    carrying seeded data only. _This entry MUST NOT be read as closed by the existence of feature
    013_, nor by the proximity of any entry resolved beside it. Escalated in 3.0.0, 3.1.0 and 3.5.0.
20. ~~**The push provider, and VAPID key custody.**~~ **RESOLVED 2026-08-10 in 3.5.0, its two halves
    differently.** The provider half is **withdrawn as never having existed** — Web Push signs with
    the project's own VAPID pair and posts to whatever endpoint the browser issued. The custody half
    is resolved by L5: one pair per environment, a repository environment secret injected into the
    VM's `.env` by `deploy.sh`, **rotated only on compromise**. Binding text: "Notification
    delivery". _The 5.4.0 text of this entry dated the resolution "3.4.0"; the 3.5.0 amendment
    section records it, and 3.5.0 is correct._
21. **The operator address abuse reports are dispatched to, and the response expectation attached to
    it.** _Added 2026-08-08 in 3.1.0. ADDRESSED, NOT CLOSED._ The address was **resolved in 3.5.0 by
    L6: `apps@programasemilla.com`**, and **changed, not closed, in 4.0.0 by A5**: a platform
    operator reading the queue now keeps the reporting dialog's promise without any mail. What
    survives is the harder half, unchanged in force — **somebody has to be that operator.** A queue
    nobody opens is as empty a promise as an inbox nobody reads, and this remains an obligation the
    owner personally holds. The mail path is not deleted, because an operator who must open a site
    to learn a report exists learns late.
22. ~~**A cached conference outlives a withdrawn registration by up to 24 hours.**~~ **RESOLVED
    2026-08-15 in 5.4.0 by R1 — ACCEPTED, not fixed.** The 24-hour readable window is ratified; the
    ground it was tolerated on (_"not another attendee's personal data"_) is **struck as false**, and
    it is accepted instead because no third party can end a registration today. **That ground is
    protected by a naming convention**: the attendee-restriction guard MUST be widened to the concept
    before 015 is specified, and **if 015 adds a route ending a registration this entry reopens.**
    Two mechanisms licensed, three rejected on evidence, the lifetime figure deferred. Binding text:
    "Data scoping, content provenance, and composition".
23. **Whether the design tokens adopt the brand's navy and coral.** _Added 2026-08-10 in 3.4.0,
    created by B4._ Measured from the supplied board, the brand and the tokens disagree: brand navy
    `#0d1942` against `navy-800 #1b2340`, brand coral `#fe6551` against `coral-500 #e8634d`. Cream
    agrees and is not at issue. Adopting the brand values would make the board the single source of
    truth for colour and remove the seam between the icon plate and the token-derived `theme_color`
    on the splash screen. **The cost is that it repaints the entire product**: `navy-800` is the
    primary surface and `coral-500` is both the accent and the focus ring, so every contrast ratio
    the accessibility suite asserts must be re-verified on new values. **Blocks nothing** — the
    product behaves as specified either way, and feature 010 is explicitly forbidden from resolving
    it. What it costs to leave open is one visible seam on one surface.
24. ~~**What the administrative report queue may disclose.**~~ **RESOLVED 2026-08-11 in 4.1.0 by
    A8** — the reported content and the reporter's stated reason, to platform operators only: the
    **third** Principle VIII exception, under four scoping conditions.
25. ~~**What happens when a promoted conference organizer deletes their own account.**~~ **RESOLVED
    2026-08-11 in 4.1.0 by A9** — assignments revoked in the same transaction, deletion never
    conditional, the conference visibly `unassigned`; the same rule applies to withdrawal. Binding
    text: "Administration, and the second actor".
26. ~~**The administrative site's origin and session topology.**~~ **RESOLVED 2026-08-11 in 4.1.0 by
    A7** — a subdomain of the same registrable domain, `/api/*` reverse-proxied under it, and a
    host-only session cookie giving two independent sessions: same-site _and_ different-origin.
    Binding text: "Deployment environments".
27. ~~**Q&A attribution: full name, first name alone, or attendee-chosen.**~~ **RESOLVED 2026-08-15
    in 5.4.0 by R2: first name plus surname initial — "Ana R."**, wherever a question is displayed.
    **Decided on the client's behalf and in tension with her literal words**; she must be told. **The
    entry's enumeration was incomplete** — three options were listed and six existed — which is the
    transferable lesson. Binding text: "Audience questions".
28. **Two brand marks now coexist, and which one is MyNet's is undecided.** Created by C4 in 5.0.0.
    **Blocks nothing**, and the product behaves as the owner directed. The install icon derives from
    `assets/brand/new-logo.png` — a gradient disc — while every in-app mark derives from the board's
    coral N. The owner ruled explicitly that this is an icon change and not a rebrand, so the
    divergence is **accepted knowingly** rather than overlooked.

    Recorded because a knowingly accepted divergence and an unnoticed one look identical six months
    later, and because the resolution in either direction is expensive: adopting the gradient mark
    in-app repaints five authentication screens, the rail and the top bar, and interacts with entry
    23, which concerns the board's values and not this mark's. **No feature may resolve it by
    quietly replacing one mark with the other.**

29. **Whether an attendee may suppress content in notifications.** Opened in 5.2.0 (drafted as 27).
    **Promoted** from a deferral that has sat in prose since 3.1.0 — it was recorded there as
    "accepted rather than solved" and never given a number. 5.2.0 makes it apply to a **second**
    content type: a saved-session notification carries a session title, so what somebody chose to
    attend is now visible on their locked device alongside what somebody said to them. Two
    amendments have now accepted the same cost without deciding the mitigation, and the usual one —
    a per-attendee content preference — has never been weighed. It is numbered now because a
    consequence recorded twice in the same words is a consequence nobody is going to act on.
    **Blocks nothing.**
30. **Speakers are personal data about people who are not attendees.** Opened in 5.2.0 (drafted as
    28). A speaker row carries a real person's name, title and company. This is not new — the rows
    have been seeded since 002 — but 5.2.0 makes them **organizer-authored**, which moves
    responsibility from a reviewed commit to a promoted attendee typing into a form. Principle VIII
    has only ever considered attendees, and both coverage tests derive their expectations from the
    schema, so the question they cannot ask is who answers for a person who never signed up.
    **Blocks nothing today; it blocks any claim that Principle VIII's coverage is complete.**
31. **Whether deleting a session should notify the attendees enrolled in it.** Opened in 5.3.0. O2
    places an enrolment outside N5's engagement set, so a session with live enrolments may be
    deleted — and because enrolling _replaces_ saving on an optional session, those attendees hold no
    `saved_sessions` row and are therefore reached by no marker and no push. **A held seat can
    disappear with no trace, and the person learns by arriving.** The obvious remedy is to notify
    them, and that is exactly what cannot be done cheaply: a deletion is not one of N1's three
    material changes, so notifying on it is a **third trigger** and needs its own amendment. Opening
    this rather than solving it is deliberate, on the same reasoning 4.0.0 gave when it predicted the
    third privacy exception and refused to grant it by inference. **Blocks nothing**; the product
    behaves exactly as O2 ratifies.

    _It shares a boundary with entry 29 and is not merged with it._ Both are about what the product
    fails to tell somebody about their own commitments — 29 about what a notification discloses, 31
    about a notification that is never sent — but a suppression preference and a missing trigger
    are different mechanisms with different costs.

**Unnumbered matters resolved before numbering stabilised** (details in the history): the product
name is MyNet (2.0.0); MyNet is the real product with durable server-side persistence (2.0.0); event
scoping is hybrid, a profile detail view is delivered, and the API lives in this repository (all
2.1.0); `VisibilityService` is a seventh device capability, and reports leave the product as operator
mail (both 2026-08-08); standing decision 16 was sharpened to forbid any per-field audience (3.2.0).

**Delivered requirements withdrawn by amendment** — the retractions that made 3.0.0 and 5.0.0 MAJOR,
listed so none is rediscovered as a regression: **001 FR-066 and SC-011** (per-change previews,
3.0.0; FR-067 survives and binds UAT); **009 FR-756a** (refusal purges the conference cache, 3.3.0
Q2 — the gap it named became entry 22); **008's one-directional sharing rule** (5.0.0 C1); **009's
publish-on-asking Q&A model** (5.0.0 C2).

**Raised by reviews, not yet numbered — promoting one to a numbered entry is an owner act**

- **A mutually exchanged card outlives the discoverability that licensed it** (016's deep review).
  The exchange is licensed because a card resolves only what its owner already published to
  co-attendees — true at the instant of sharing, not for the duration: discoverability is revocable
  and event-scoped, a held card is neither. Looping `POST /cards` over the directory converts a
  revocable publication into a permanent one; the throttle bounds a rate, not a right, and
  `GET /cards/shared` has no client consumer, so a subject cannot see who holds their card.
- **Whether a question's payload should carry `authorId`, and whether `listBlocks` should be
  narrowed** (009's deep review). `authorId` hands a co-attendee the identifier of somebody who has
  turned discoverability off, and `GET /blocks` resolves it to a live name and avatar bytes. R2 made
  this more urgent and settled neither; 017 MUST NOT treat either as settled.
- **Whether proposing a meeting should require the invitee to be discoverable**, as sharing a card
  does (008's deep review). The spec's Assumptions say no.
- **Whether the audit trail's retention clock starts at pseudonymisation**, as `maintenance.ts` and
  `admin-audit.ts` claim (013, `deviations.md` D11). The predicate measures `occurred_at`, so a
  recent erasure's accountability record can be swept immediately. Fixing it needs a column and a
  migration; `retention-sweep.test.ts` pins current, not desired, behaviour.
- **Whether 24 hours is the right cache lifetime** — deferred by R1 as a usefulness judgement to make
  after a real conference.
- **The mobile top bar truncates "MyNet" to "M…"** at every mobile width, since before 010. The
  owner's call.

**Owner obligations — not questions, and not discharged by any code**

- **The client must be told** that "Ana R." reads her _"únicamente el primer nombre, sin apellidos"_
  as being about tone rather than the surname (R2); if her concern is findability, R2 was wrong on
  its own reasoning.
- **Somebody must actually read** `apps@programasemilla.com` and the report queue (entry 21).
- **Server-side branch protection must be applied** from `.githooks/README.md` (entry 15).

**Known unclaimed defects** (004's review): neither token table indexes `attendee_id`, so every
account deletion cascade-scans both; and migration `0003` rewrites `events` under a volatile default
with no `lock_timeout`. Both need deliberate work, because the fix regenerates a Drizzle snapshot.
