# Owner decisions — numbered log

**A living record, not governance.** The rules these decisions produced are in
`.specify/memory/constitution.md`, which is authoritative; this file keeps the **numbered** decisions
that code comments and specs cite as "decision N", with the reasoning each was taken on. Decisions
1–56 were moved verbatim from `CLAUDE.md` on 2026-09-24. **New decisions are appended at the end**,
numbered from 57; a decision that changes a constitutional rule is also an amendment (constitution
G.2). Constitution rule numbers (e.g. P.17) changed in v6.0.0 — decisions cite the rule text, not
the number. *Known numbering collisions, preserved rather than renumbered because code and specs cite these
numbers*: **30** is used twice (the UAT address in the 3.5.0 block, and the brand mark in the 3.4.0
block), and **31–35** are used twice (the 3.5.0 deployment decisions, and the v4.0.0 administration
decisions). In administrative code, "decision 31–39" means the v4.0.0/v4.1.0 block. The next free
number is **57**.

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
    010 — **refiled against 012 in v5.4.0's hygiene pass**, having never been updated when v3.5.0
    split the phase into 011 and 012 — rather than 009's to fix alone. *Closed 2026-08-15 by
    decision 54.*

**2026-08-10** (ratified in constitution v3.5.0) — **the first amendment that gates a deployment
rather than a feature.** Nothing here changes what the product does; it changes where it runs, who
may reach it, and who holds the keys. Taken in brainstorm #08. With these, **no register entry
blocks phase 011** — the UAT half of the split this same amendment made:

30. **UAT is `mynet-dev.programasemilla.com`, openly reachable, carrying seeded data only.** No
    credential, no allowlist, no network boundary — **FR-067 is satisfied by the data rather than
    by the door**, because nothing that must be kept from a stranger is ever present. Basic auth
    and an IP allowlist were considered and **rejected as safer-looking but worse**: each disables
    the validation the environment exists for (service-worker registration and push; a
    physical-device test on cellular) to buy secrecy over data that does not need it. *Closes
    register entry 14.*
31. **Production is `mynetcr.com`, provisionally** — not registered, not final, and it **must not
    be committed to `prod.env`** until it is, because a blank value is what makes the deploy jobs'
    refusal honest. A consequence travels with it and is now an invariant: **UAT and production
    must remain separate registrable domains**, which makes a UAT session cookie structurally
    incapable of reaching production. That is stronger than any configuration, arrived by accident
    of naming, and is written down so nobody "tidies" UAT onto a production subdomain.
32. **The Azure subscription is `d428f98f-a3c4-49c3-ae24-06ec3de08477` (LinaSys-DevEnv),
    `centralus`, both environments.** Scripts pin every call to it **by id** — a name is mutable,
    and an inherited default silently provisions into the wrong place. One subscription does not
    weaken the isolation rule: each environment still has its own host, database, secrets and
    address. *Annotates register entry 11, which was resolved in v3.0.0 having named no
    subscription.*
33. **The transactional email provider is Mailgun.** *Closes register entry 18.* `MailService`
    stays a vendor-free port with the adapter chosen **by configuration in every environment
    identically**, following the shape 007 proved for `PushService`, and the SDK stays confined to
    `apps/api/src/mail/` by the same lint boundary as storage and push. **Real mail is not optional
    for a usable environment**: verification gates discoverability, so with only the sink adapter
    every attendee is invisible to every other one.
34. **VAPID custody: one pair per environment, a GitHub Actions environment secret injected into
    the VM's `.env` by `deploy.sh`, rotated only on compromise.** *Closes register entry 20 —
    and its other half is **withdrawn as never having existed**.* There is no push provider: Web
    Push signs with the project's own pair and posts to whatever endpoint the browser issued. The
    entry had been worded as "the push provider" since v3.1.0, phrased by analogy to entry 18 which
    does have a vendor. Rotation is forbidden except on compromise because it is a **silent
    delivery outage** for every attendee until their browser re-registers, and nothing in the
    product could tell them.
35. **Abuse reports go to `apps@programasemilla.com`.** *Closes register entry 21.* **The address
    closes the entry and does not discharge the obligation** — it was filed as something the owner
    personally holds, and naming a mailbox does not make somebody read it.

**Escalated at the same time and deliberately not resolved**: register entry 19 — nobody moderates
uploaded avatar images. Decision 30 makes a permanent, openly reachable environment with public
sign-up and image upload a **present fact** rather than a prospect. Decision 35 narrows it by
supplying the operator mailbox that 007's report-to-an-operator path always needed, so the nearest
available answer now exists; whether avatars use it is undecided.

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
    is new register entry **23** (this brief numbered it 22 until v5.4.0's hygiene pass; 22 is the
    cache gap), and the resulting seam between the icon plate and the token-derived
    `theme_color` is knowingly accepted. **Deliberately not closed**: register entry 4, the
    unvalidated desktop and tablet layouts, which this work *escalates* by putting a mark in both.
    *Entry 4 closed 2026-08-15 by decision 56, without the client acceptance act it asked for.*

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
36. **Delivery is three features behind one amendment** — 013 (administrative foundation and the
    report queue), 014 (conference content authoring), 015 (registration and attendee management).
    *Numbered 011–013 when the amendment was ratified; the UAT deployment work took 011 from a
    parallel branch, so the programme shifted rather than renumbering a phase already on `develop`.*
    **013 reserves migration `0009`.** One amendment rather than three, because the second actor is a
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
the same session. The administrative programme is unblocked:**

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

**2026-08-12** (ratified in constitution **v5.0.0**) — **the project's third MAJOR, and the first
amendment driven by the client USING the product rather than by a design session.** It retracts two
delivered guarantees, one of them **48 hours after it was ratified**. Sources: brainstorms #10 and
#11, and `assets/feedback-1.md` — 118 requirements extracted from a 52-minute client conversation:

40. **Sharing a card is a mutual exchange.** One act, both parties hold each other's card, the
    recipient is not asked. **Reverses decision 25 / v3.2.0 N2** and the sentence that carried it —
    *"nothing about a person may become durable without that person's own act"*. **The physical-card
    metaphor is NOT the argument and must never be cited as one**: it was available to N2 and is not
    what N2 was argued from, so it cannot be what unmakes it. The operative ground is that a card
    resolves only what its owner already published to co-attendees under decision 16's single
    visibility decision — so the exchange moves *when* a co-attendee sees those fields, not
    *whether*. The client reached the same position independently (REQ-046). Three bounds: **both
    records commit in one transaction or neither**; blocking still severs resolution **both ways**,
    so the escape hatch predates the change; and nothing else about a card moves — no recall, live
    resolution, no verification check. **Not decided**: whether the recipient must be discoverable at
    the moment of sharing. Delivered by **016**.
41. **The Q&A model is replaced by the client's, in full.** Moderated before publication, resolved/
    pending lifecycle surviving the event, manual grouping, projectable in vote order. **Reverses
    decision 27 / v3.3.0** and retracts shipped 009 requirements. **A premise expired rather than a
    mind changing**: 009 wrote against itself that a public Q&A surface *"needs a moderator, and a
    moderator is an organizer — the actor Principle III excludes by construction"*, and v4.0.0
    created that actor. **Moderation does not replace reporting** — pre-publication screening and
    post-publication reporting cover different moments and both ship. **A moderator reading an
    unpublished question is not a fourth privacy exception** (content submitted for publication was
    never private), but **a refused question is stored personal data** and needs cascade, export and
    retention like anything else. **Attribution is explicitly NOT ratified** — register entry 27,
    *closed 2026-08-15 by decision 55 as first name plus surname initial, which unblocked 017*.
    Delivered by **017**.
42. **Every feature declares its administrative counterpart**, including where it is explicitly
    none. A Principle IX obligation and a Feature Declarations row. **"None, because…" is valid and
    common; silence is not — the obligation is to have looked.** Set the day a request to add a
    confirm-password field turned out to span **five screens across two products**, where the natural
    reading was one, and the two nobody was looking at guarded the tier that reads the report queue.
    Since v4.0.0 there are two actors and two sites against one database, and the failure mode is a
    capability attendees have that no administrator can see, undo or answer for.
43. **The install icon derives from a SECOND brand source, and this is not a rebrand.**
    `assets/brand/logo.png` remains the source for every **in-app** mark; `assets/brand/new-logo.png`
    is the source for **install icons and favicons only**. The in-app coral mark is untouched and
    **register entry 23 is unaffected**. Three rules bind the second source, each because it
    contradicts something already binding: the **wordmark is cropped away** (a raster lockup stays
    forbidden); the **plate colour is chosen deliberately and recorded**, because the board's navy
    was derived mechanically from a source with no alpha and this one has alpha; and the ~4× upscale
    is a **measured, named exception** in `brand-audit.mjs` — naming this file, this factor and these
    outputs, so a *second* upscale still fails. **Weakening the check until it stops checking
    anything is forbidden.** The home-screen icon will visibly differ from the in-app mark:
    **knowingly accepted**, and **register entry 28** is why that is recorded rather than left to be
    rediscovered. Delivered by **016**.

**Three things v5.0.0 deliberately did NOT decide, and none may be read as settled**: notification
triggers 2 and 3 are present in the client conversation (REQ-095 document published, REQ-112 session
starting in 15 minutes) and are **not granted** — each needs its own amendment, and REQ-112 needs a
scheduled-work mechanism this product has never had; **payment-gated event access** (REQ-024) does
not move, exactly as it did not at v4.0.0; and **networking outside an event** (REQ-047, REQ-048) is
blocked on the client's own legal review (REQ-049).

**2026-08-12** (ratified in constitution **v5.1.0**) — **the smallest amendment this project has
made, and the only one drafted by an implementation rather than requested by anybody:**

44. **`InstallService` is an eighth device capability.** Principle V's enumerated list goes from
    seven to eight, and **the listing is the ratification act** — `VisibilityService`'s precedent
    from v3.1.0, followed exactly. MINOR: a section is materially expanded, no prohibition is
    lifted, and nothing delivered is retracted. **Not sought**: 016's specification and its review
    gate both missed the dependency, and Phase 0 research found it — install detection needs
    `matchMedia('(display-mode: standalone)')` and a `beforeinstallprompt` listener, and
    `mynet/no-direct-platform-access` names both in its DOM set. The alternatives were an interface
    or a lint exemption, and an exemption would have traded a structural boundary for an install
    banner, which is the constitution's own reasoning for the seventh. **The interface must model
    both platform halves as first-class**: Chromium can present a real prompt, iOS Safari exposes no
    install API at all, and a shape built only around the first makes the second look like a failure
    and invites a control that cannot work. **Nothing about notification triggers moves** — a
    received message is still the only thing that dispatches, and the guidance requests no
    permission. *That last clause was true when written and is superseded by decision 45 below,
    which was ratified the same day on a branch this one could not see. The trigger set is two.*

**2026-08-12** (ratified in constitution **v5.2.0**, drafted and ratified as v5.2.0 — see below) —
**the amendment gating 014, and the first widening of the notification trigger set since v3.1.0
created it.** Two decisions, stated separately because either could have been inferred from the other
and neither was.

**Read the renumbering before the decisions.** This amendment and v5.0.0/v5.1.0 were taken on the
same day from the same base on branches that could not see each other. v5.0.0 merged first, so it
keeps its numbers and this one rebases: the amendment is **v5.2.0**, its standing decisions are
**45–49** (drafted as 40–44), and its register entries are **29 and 30** (drafted as 27 and 28).
Nothing in it changed in substance. It is the fourth numbering collision this project has had — after
constitution versions, migration numbers and feature numbers — and the first to reach the decision
register, which is now known to be a shared numbering table like the others.

45. **A second notification trigger exists: a material change to a session the attendee has SAVED.**
    Material means **exactly three things — the session is cancelled, its start time changes, or its
    room changes.** The principle that generated the set is *a notification is raised when a change
    affects **where or whether** the attendee must be somewhere*; a title, a summary or a change of
    speaker is content, and content does not strand anybody in the wrong corridor. **The set is
    enumerated rather than described on purpose**: v3.1.0's rule was narrow *by construction* — "a
    feature that wants a second trigger MUST amend this block" — and 014 is the first feature to take
    it up, so the rule worked exactly as designed. What widening costs is that "one trigger" could be
    checked by reading one sentence and "two triggers, the second bounded by three named changes"
    cannot. **A session *starting* is still forbidden**, and that distinction is load-bearing: the
    first is a reminder an attendee could set themselves, the second is information only the product
    holds. **The bell and the in-app notification centre remain forbidden**, unchanged.
46. **The in-app marker is per-row state, never an inbox — and the prohibition governs surfaces
    INSIDE the product.** A changed saved session is marked on its own row in Agenda and on Home.
    One organizer act dispatches **one coalesced notification per attendee** whose body carries a
    count, however many of their saved sessions it touched: a notification is a single interruption
    by nature, and a dozen interruptions from one act is the product v3.1.0's exclusion existed to
    prevent. So **a count is permitted in the payload and forbidden everywhere it could become
    something to look at.** Two rules hold that line: activating such a notification MUST land on the
    destination carrying the per-row markers, never on a list of changes; and **no view in either
    product may present that count.** The moment a screen answers "how many things changed", this is
    broken regardless of what the payload does.
47. **A conference organizer may create a conference, and is assigned to what they create.** This is
    the **only product-wide capability the tier holds**, and it is stated rather than inferred
    because decision 32's *"authority reaches only the conferences they are assigned"* cannot
    describe the act of creating one. Two bounds keep that clause true in substance: authority over a
    conference they did **not** create still comes only from assignment by a platform operator, and
    creating is **not a promotion path** — it grants no platform capability and no route to promote
    anybody. **Nothing bounds how many conferences an organizer may create**, which is bounded by
    trust rather than by a limit, since promotion is itself platform-tier only. Recorded as accepted,
    not overlooked.
48. **Conference content is live-edited. There is no draft/publish lifecycle**, and a feature MUST
    NOT add one without an amendment. A conference is reachable only by its join code, so an
    unfinished one is already private to whoever holds that code — a lifecycle would be a second gate
    over a gate that exists, and a second state for every read path to consult. The consequence is
    accepted rather than hidden: an organizer authors into a conference their attendees can already
    see.
49. **A session ANY attendee has engaged with may be CANCELLED and MUST NOT be deleted.** Engagement
    means a saved session, a private note, a question, or a vote. Deletion stays available only while
    nothing is attached; cancellation is **stored state**, not derived — unlike 008's `lapsed`,
    because it is an organizer's act rather than a function of the clock. **This is a correction of a
    live hazard rather than a preference**: `saved_sessions`, `session_notes`, `session_questions`
    and `question_votes` each cascade from `sessions.id`, so before 014 one delete would have
    destroyed other people's private writing with no confirmation and no record. **009's precedent
    does not license it** — a withdrawn question takes everybody's votes because the *author*
    exercised erasure over their own words, and that does not transfer to a third party erasing
    somebody else's. The cascades are **not removed**; they stay correct for the case deletion is
    still permitted, and the protection is the refusal plus a lock, not a change to the referential
    rules.

**Two register entries opened by v5.2.0, and neither blocks 014**: **29** — whether an attendee may
suppress content in notifications, **promoted** from a deferral that had sat in prose since v3.1.0,
because a saved-session push now puts a session title on a lock screen alongside message text and two
amendments have accepted the same cost without deciding the mitigation; and **30** — speakers are
personal data about people who are not attendees, which is not new, but v5.2.0 makes those rows
**organizer-authored** rather than seeded, moving responsibility from a reviewed commit to a promoted
attendee typing into a form. **Entry 29 shares a boundary with v5.0.0's entry 27** — both are about
what the product discloses about a person without asking them — and they are deliberately not merged.

**2026-08-14** (ratified in constitution **v5.3.0**) — **the amendment gating 014 tranche 2, the change
that closes 014. It is the first amendment to grant a Principle VIII exception that the principle's own
text had predicted in advance**: that text read *"Three exceptions are recorded; a fourth needs a fourth
amendment"*, and this is the fourth. MINOR, judged explicitly against a real MAJOR argument — it
narrows FR-1042, and v3.0.0 was MAJOR for retracting a delivered requirement. It does not carry because
FR-1042 is **narrowed, not withdrawn**: it survives intact for saved sessions, notes, questions and
votes, and yields only for enrolment, only to an assigned organizer. Adding a Principle VIII exception
was MINOR in both v3.3.0 and v4.1.0.

50. **A named enrolment roster is visible to a conference organizer assigned to that conference.** The
    **fourth** recorded Principle VIII exception, and the first administrative read of attendee state
    this project has ever permitted. Four conditions bind: **only an assigned organizer**, for their
    own conferences (a platform operator holds it by the product-wide authority they already have);
    **only enrolment** — no saved session, private note, question or vote is disclosed to any
    administrative tier, and FR-1042 survives unnarrowed for all four; **only that conference's
    sessions**, so it is not a directory, not a cross-conference view of one attendee and not a route
    into a profile; and **the attendee is told before they enrol**, which makes this the only one of
    the four exceptions the subject can decline by not acting. Motivated by REQ-086: an organizer told
    to close enrolment early *because materials must be prepared* cannot prepare them for people they
    cannot name. **Recorded rather than reasoned away**: an enrolment is arguably not "messages, notes,
    and appointments" as the private-content clause enumerates them, so a feature could have concluded
    no exception was needed — which is exactly the shortcut v3.3.0 and v4.1.0 each refused.
51. **An enrolment is NOT engagement, and a session with places held MAY be deleted.** Decision 49's
    set stays at four — a saved session, a private note, a question, a vote — and a fifth attachment
    type is declared **outside** it. **The cost is ratified, not overlooked**: because enrolling
    *replaces* saving on an optional session, an enrolled attendee holds no saved row, so deleting
    that session destroys held places **with no notification, no marker and no trace**, and the person
    finds out by arriving. Delivering it requires the **first entry** in a `NOT_ENGAGEMENT` list that
    is empty by design and demands each entry say *whose data it is and why losing it silently is
    acceptable*. This sits against decision 49's own rationale, and that tension is why it is written
    down. **It is NOT precedent for narrowing decision 49's four**, and whether such a deletion should
    notify the enrolled is **register entry 31**.
52. **An attendee may be shown the number of remaining places** — "4 places left". This is **not** the
    count v5.2.0's N2 forbids: N2's subject is a count of *changes*, and this is a fact about one
    session's availability at the moment somebody decides whether to take a seat. It is the same
    *family*, so it is ratified deliberately rather than inherited by silence. **N2 is untouched and
    unweakened.**
53. **Migration numbers are claimed at generation, not reserved in advance**, and the claiming feature
    MUST extend the roadmap's number table in the same change. Reserve-in-advance collided three times
    and each collision left a permanent artifact rather than a one-off fix — the journal carries
    `idx: 10` against tag `0011_conference_authoring` and snapshot `0010_snapshot.json`, a three-way
    skew every future generation must be told about. It also held `0010` for a phase that adds no
    schema at all. **Reserving only works when branches can see each other's reservations, and the
    recurring lesson of this project is that they cannot.**

**One register entry opened by v5.3.0, and it blocks nothing**: **31** — whether deleting a session
should notify the attendees enrolled in it. Decision 51 makes such a deletion silent, and the remedy
would be a **third** notification trigger and therefore another amendment, so it is opened rather than
solved — the same reasoning v4.0.0 gave when it predicted the third privacy exception and refused to
grant it by inference. **It shares a boundary with entry 29** — both are about what the product fails
to tell somebody about their own commitments — and they are deliberately not merged: a suppression
preference and a missing trigger are different mechanisms with different costs.

**2026-08-15** (ratified in constitution **v5.4.0**) — **the first amendment whose entire subject is
closing questions rather than licensing work.** It gates no feature's first line of code. It closes
**three** register entries — 22, 27 and 4 — opens **none**, and unblocks **both** remaining blocked
features: 017 (on 27) and 012 (on 22 and 4). MINOR, judged explicitly against a real MAJOR argument,
on the practised test that **withdrawing** a delivered requirement is MAJOR while **narrowing** one
is MINOR: decision 55 narrows FR-702's rendered form and withdraws nothing, and decision 56 is MINOR
because of how it is worded — it does **not** claim that passing tests validated a layout, which
would have retracted a governance rule and made this MAJOR. Entries 19, 21, 23, 28, 29, 30 and 31
are untouched, and 19 and 21 remain the oldest live entries. Decision prefix `R`; taken on
`brainstorm/13-blocked-entries-decision-packets.md`, which records no decision and stays as written
so the reasoning outlives the conclusions.

54. **The cached conference that outlives a withdrawn registration is ACCEPTED, not fixed: a device
    may keep showing a conference the person has left for up to 24 hours from retrieval.** *Closes
    register entry 22.* **The ground the register gave for tolerating it is struck as false, and
    five features carried the entry as low-severity on the strength of it.** It said the data was
    *"the conference programme, not another attendee's personal data"*; the cached `appointments`
    payload has carried the other party's display name and the agreed meeting topic since **008** —
    *before* that sentence was written in 009 — and the cached programme embeds every speaker's
    name, title and company, which is register entry 30's subject. **It is accepted on a different
    and true ground**: no third party can end a registration today, and the only way one ends is an
    act the attendee performs on their own device, which purges that device in the same action.
    **That ground is protected by a naming convention, which is the most fragile thing this
    amendment ratifies.** `apps/api/tests/unit/no-attendee-restriction.test.ts` selects routes by
    the URL regex `/suspend|ban\b|mute|restrict|disable|block|silence/i`, and a route named
    `DELETE /admin/conferences/:eventId/registrations/:id` matches none of those words and **passes
    green** — 015 is called "registration and attendee management". **The guard MUST be widened to
    the concept before 015 is specified, and if 015 adds such a route this entry reopens** rather
    than being reasoned around. **Two mechanisms are licensed and neither needs a further
    amendment**: delete an entry at the moment it stops being readable — nothing evicts today, so
    "24 hours" has always bounded *serving* and never *retention*, and this is the only change that
    reduces what a disconnected device holds — and erase any conference absent from a successful
    read of the conferences the attendee is registered for, which lives in the composition root
    rather than in the caching decorator and so sidesteps the exact objection that withdrew 009's
    FR-756a. **Three are rejected on evidence rather than on cost, and are named so they are not
    re-proposed**: reinstating FR-756a fires on a refusal that frequently never arrives; a
    server-sent "forget this" message **cannot be built**, because subscriptions are registered
    `userVisibleOnly: true` and a new dispatcher would be a third notification trigger and therefore
    another amendment; and keying the stored copy to the registration is ineffective, because a
    disconnected device cannot learn the registration ended and matches its own stale label.
    **Whether 24 hours is the right span is DEFERRED, not decided**: since 014 an organizer can
    cancel a session, move a room or change a start time, so a day-old programme can be *wrong*
    rather than merely old — which argues for shortening on **usefulness**, not privacy — and the
    cost cannot be priced from this repository, which is what 005 said when it set the value. It
    returns as a product judgement once a real conference has been run, and it is **not** a register
    entry. **Two shipped defects are fixed regardless, because neither is a choice.** Account
    deletion computes its purge prefix from a no-argument call, yielding `attendee:<id>|event:|` — a
    range that cannot match `attendee:<id>|event:<uuid>|…`, since every UUID first character sorts
    below `|` — so **a second device keeps everything, including private session notes, permanently,
    while the deletion screen promises in bold that no copy is kept.** And the reconnection purge
    does not fire on a cold start at all, because `GET /workspace/active-event` answers a
    de-registered attendee with **204, a success**. The comment claiming *"online, an authorization
    refusal purges the conference's entries immediately"* is true of the mechanism and silent on
    whether the refusal arrives: **the documented false-header class, in the file the entry is
    about.**
55. **A published question is attributed as first name plus surname initial — "Ana R.".** *Closes
    register entry 27, and unblocks 017.* It applies wherever a question is displayed: the
    attendee's phone, the moderation queue, and the projected screen v5.0.0 ratified. **Decided on
    the client's behalf, and recorded rather than glossed.** It reads REQ-062 and REQ-063 as being
    about **register and tone** — a full legal name makes a casual question feel like a filing —
    rather than about the surname as such, and **it is in tension with her literal words**,
    *"únicamente el primer nombre, sin apellidos"*, because an initial is a fragment of an apellido.
    **She must be told, not left to discover it at an event**; if her concern proves to be
    findability rather than tone, the decision was wrong on its own reasoning and should be
    revisited, which is cheap because this option moves in either direction more easily than the
    five it was chosen against. **The framing the entry was carried under was incomplete, and that
    is the transferable part**: the register offered three options and six existed, and two of the
    missing ones — this one, and a collision-aware form showing an initial only where first names
    collide — cost exactly what the cheapest listed option costs and **dissolve the deciding case**,
    which is two attendees named Ana at one conference whose questions appear together on a hall
    wall. **A register entry that enumerates its options is asserting that the enumeration is
    complete**, and this one was not. **What it narrows is FR-702's rendered form only**: FR-734
    survives verbatim, attribution stays unconditional, a non-discoverable attendee is still named,
    and SC-707 stays true — Principle VIII's second recorded exception gets **smaller**. **One thing
    MUST ship with it or the change buys nothing.** `POST /blocks` carries no throttle and
    `GET /blocks` returns the target's live display name **and card-rendition avatar bytes**, so
    under any abbreviated attribution blocking becomes a one-request, unrate-limited way to convert
    "Ana R." into a full name with a photograph — an abbreviated name without that closure
    **relocates disclosure rather than reducing it**. `blocks.ts` asserts that the caller *"already
    knows exactly who these people are, having blocked them by hand"*, a claim this decision
    falsifies in a file it does not otherwise touch. **Not resolved, and made more urgent**: whether
    a question's payload should carry `authorId`, and whether `listBlocks` should be narrowed — both
    raised at 009's deep-review gate, both untouched here, and **017 MUST NOT treat either as
    settled by this.** **Left to 017 deliberately**: what "Ana R." renders as for a mononym, and
    whether a multi-token given name yields "María R." or "María José R.". `display_name` is one
    free-text field, so the surname half is a derivation and its edge cases are implementation
    rather than governance; `initialsOf` already performs that split with `Intl.Segmenter` rather
    than `slice`, and is the precedent to follow.
56. **The shipped desktop and tablet layouts are ratified as intended, by the owner, without a
    client acceptance act.** *Closes register entry 4 — the oldest live question about the product's
    appearance — and unblocks 012.* **It is NOT a claim that the layouts were validated, and
    specifically not a claim that green gates validated them**: v5.0.0's rule that no feature may be
    read as having validated a layout because its tests pass **stands unamended and is deliberately
    unused here**, and anybody citing this as evidence the layouts were reviewed has misread it. The
    owner ratifies in the acknowledged absence of validation. **The cost is ratified with it rather
    than softened**: desktop use is the client's own stated requirement (REQ-108, REQ-110), she has
    never seen the product at a desk, and closing the entry removes the thing that kept each new
    feature's unreviewed desktop design visible — so **the debt resumes compounding silently**, paid
    by whoever meets the first defect in production. The two defects this entry produced were each
    found within minutes by the first person to look at a screen, which is the honest measure of
    what is being given up. **Two judgement questions are ratified as-is and must not be reopened as
    defects**: the 768–1279px rail divergence between the two products, where MyNet shows an
    icon-only rail and the administrative site a labelled one; and Home's two-column card
    arrangement on an upright tablet. Both were unrecorded choices rather than constraints — the
    administrative app imports MyNet's tokens and then uses none of its breakpoints — and both are
    now choices. **One item is CARVED OUT as a defect and MUST be fixed**: `AdminShell` presents
    **two** layouts where Principle IV requires three — below 768px the administrative site's only
    navigation is a horizontally scrolling strip, and at 768–1023px the rail is labelled rather than
    reduced. **Fiat may close a judgement; it cannot make a non-compliance compliant.** It is
    checkable today with no client and no UAT, and the end-to-end sweep **cannot see it by
    construction** — it measures document-level overflow, which an inner `overflow-x-auto` container
    is designed to keep at zero — so the fix must carry an assertion that does not depend on that
    measurement. **One gap closes at no cost and is not a layout question at all**: Playwright
    declares a single Chromium project, so **Safari layout is unverified at every width**, not only
    on desktop, and the physical-iPhone test 012 already carries is otherwise the only WebKit
    evidence this project will ever produce. Adding WebKit and Firefox projects needs no client, no
    UAT and no decision.

**Three obligations are carried out of v5.4.0, and two of them belong to the next two features to
start.** None is optional and none is tracked by a register entry, because no entry was opened.
**015 must
widen `apps/api/tests/unit/no-attendee-restriction.test.ts` from a URL-keyword regex to the concept
before it is specified** — decision 54's whole ground is that no third party can end a registration,
and a route named `DELETE /admin/conferences/:eventId/registrations/:id` passes that guard green; if
015 adds such a route, **entry 22 reopens.** And **017 must close the unthrottled block lookup in the
same feature as the attribution change** — an abbreviated name beside a one-request, unrate-limited
`POST /blocks` whose `GET` returns a live display name and avatar bytes relocates disclosure rather
than reducing it. **A third obligation belongs to no feature yet**: the `AdminShell` carve-out in
decision 56 must be fixed, and the amendment names nobody to fix it.
