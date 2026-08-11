<!--
SYNC IMPACT REPORT
Version change: 4.0.0 → 4.1.0

RATIFICATION STATUS: **RATIFIED 2026-08-11 by the project owner**, in the same session that ratified
4.0.0 and immediately after it. 4.0.0 opened entries 24, 25 and 26 and declared all three blockers on
feature 011; this amendment closes all three. **Feature 011 is now unblocked.**

Rationale: MINOR. Principle VIII's "private content stays private" clause gains a **third** recorded
exception, two binding-constraint blocks are extended, and three register entries close. No principle
is removed or redefined, nothing delivered is retracted, and no work performed under 4.0.0 is
invalidated. **It is not PATCH** for the reason 3.3.0 gave when adding the second exception: an
exception to a privacy rule is a change in what the product may do, not a clarification of what it
already did.

Owner decisions cited by this amendment (all 2026-08-11):
  A7. The administrative site is served from a SUBDOMAIN of the same registrable domain, with
      `/api/*` reverse-proxied under it so its calls stay same-origin, and its session cookie is
      HOST-ONLY — so an operator signed into both products holds two independent sessions.
      (Resolves register entry 26.)
      The reasoning turns on a distinction the entry warned against assuming either way:
      **`SameSite` is evaluated against the registrable domain, not the origin.** A subdomain is
      same-SITE and different-ORIGIN, so D11's CSRF defence survives untouched *and* the
      administrative app gets its own service-worker scope, its own storage and its own CSP. Neither
      alternative offers both: a path shares the origin (and the attendee service worker, registered
      at root scope, would intercept `/admin`), and a separate registrable domain is the exact shape
      of the 3.0.0 failure where `SameSite=Lax` stopped being sent and nobody could sign in.
  A8. The report queue DISCLOSES THE REPORTED CONTENT and the reporter's stated reason, to platform
      operators only. (Resolves register entry 24. **This is the third Principle VIII exception**,
      and 4.0.0 predicted it would be one.)
      Ruled on the argument the entry recorded as available: a moderator cannot judge conduct they
      cannot see, and the honest alternative is not "no access" but an operator querying the database
      directly — unbounded, unscoped and unaudited. The reason field is included because the
      rationale for keeping it out of the mail **does not transfer**: it was excluded to stop the
      text living in "an inbox nobody in this project controls", and a queue reading the row is the
      one-row case that rationale contrasts against.
  A9. A conference organizer's ASSIGNMENTS ARE REVOKED IN THE SAME TRANSACTION as account deletion,
      and as withdrawal from that conference. A conference left with no organizer enters an explicit
      UNASSIGNED state that platform operators can see and act on. (Resolves register entry 25.)
      Deletion is never made conditional, so D6 holds absolutely. The shape is 008's precedent —
      withdrawing from a conference cancels the live meetings you had at it, in the same transaction,
      because authority must not outlive the access it depends on.

Added binding constraints:
  - VIII. Attendee Data Is Personal Data — the **third** recorded exception, with its four scoping
    conditions, and the 4.0.0 paragraph that predicted it superseded in place rather than deleted.
  - "Deployment environments" — D11's one-origin rule extended to cover the administrative host.
  - "Reporting conduct out of the product" — the disclosure question it deferred to entry 24 is
    answered in place.
  - "Administration, and the second actor" — gains the topology rule, the queue-disclosure rule, and
    the organizer-lifecycle rule.

Register changes:
  - 24. RESOLVED by A8. Struck through in place; numbering stable.
  - 25. RESOLVED by A9. Struck through in place; numbering stable.
  - 26. RESOLVED by A7. Struck through in place; numbering stable.
  - 19 and 21 remain ADDRESSED-not-closed, unchanged by this amendment. A8 gives an operator what
    they need to *judge* a report; it does not decide who that operator is (21) or what standard
    they moderate an avatar against (19).
  - No entry is opened. **This is the first amendment since 3.1.0 to open none**, and it is worth
    noting rather than passing over: 4.0.0 opened three and closed none, which is the expected shape
    when an actor is introduced; this one is the settling-up.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md, plan-template.md, tasks-template.md — ✅ no change required.
  - CLAUDE.md — ✅ updated: standing decisions 37–39, and the three entries moved from blockers to
    resolved.
  - brainstorm/00-overview.md, brainstorm/09-administrative-product.md — ✅ updated.

Deferred: none. Feature 011 has no blocking register entry.

A NOTE ON WHAT THIS AMENDMENT COST, recorded because the sequence is the lesson: 4.0.0 was ratified
with three known blockers and 011 could not have started under it. Answering them took one session
and produced a **third privacy exception**, a **CSRF-adjacent topology decision**, and a **deletion
rule that touches D6** — none of which is a spec detail, and all three of which would have been
decided by inference inside a feature specification had the entries not been opened deliberately.
That is the argument for opening entries you cannot yet answer.

PRIOR REPORT (3.4.0 → 4.0.0):

RATIFICATION STATUS: **RATIFIED 2026-08-11 by the project owner**, on reading the drafted amendment.
Drafted the same day at his request during brainstorm #09
(brainstorm/09-administrative-product.md), which decided the shape of the administrative product.

It was drafted first and ratified second — a gap of one exchange rather than one release — because
this project does not let an amendment ratify itself: 3.2.0 and 3.3.0 were each ratified by the
owner at the gate of the feature they licensed, and 3.4.0 by the act of supplying the asset it
recorded. **Features 011, 012 and 013 are licensed from this point.** The owner accepted, in
particular, the four decisions labelled A1–A4 below, each of which retracts something this document
previously forbade.

*What ratification does NOT do*: entries 24, 25 and 26 remain open and each blocks feature 011.
Ratifying the actor did not answer what the report queue discloses, what happens when a sole
organizer deletes their account, or where the administrative site is served from.

Rationale: **MAJOR.** Three independent triggers, any one of which would suffice under the
versioning policy's "a principle is removed or redefined in a backward-incompatible way":

  1. **Principle III is redefined.** "The attendee is the only actor in scope" — the sentence that
     opens it and that every feature since 1.0.0 has been justified against — is retracted. A second
     actor exists.
  2. **An explicit prohibition is reversed.** Principle III's "Organizer administration ... MUST NOT
     be built without an amendment" and D2's "No administrative interface, no privileged role, and
     no content import path" are the strongest exclusions in this document. This is the amendment
     they each named as their own precondition.
  3. **Delivered guarantees are retracted.** FR-132, FR-134, FR-191, FR-311 and — for the
     administrative product only — FR-548. This is the second time this project has retracted
     delivered requirements; the first was 3.0.0 withdrawing 001's FR-066 and SC-011, and it was
     MAJOR for that reason.

**What is NOT retracted, and the distinction matters**: payment processing remains excluded, and
Principle III's exclusion of it is untouched. The two were named in one sentence and are not one
decision.

Owner decisions cited by this amendment (all 2026-08-11, recorded in
brainstorm/09-administrative-product.md):
  A1. Administration enters product scope. The prohibition in Principle III is reversed for
      administration and retained for payment processing. (Reverses the exclusion standing since
      1.0.0.)
  A2. A SECOND ACTOR exists, in TWO TIERS. A *platform operator* is seeded, holds product-wide
      authority, and is the only tier that may promote or read the report queue. A *conference
      organizer* is a promoted attendee whose authority reaches only conferences they are assigned.
      **No self sign-up into either tier**: platform operators are committed seed data, conference
      organizers exist only by promotion. This is the mirror of D5 — self sign-up was chosen for
      attendees precisely because it was the only model leaving the attendee sole actor, and it is
      unavailable here because anyone who can sign themselves up as an administrator is not one.
  A3. Administration is a SEPARATE WEBSITE against the same API and database. MyNet itself gains no
      administrative surface, no privileged view, and no role-dependent rendering. This is what
      keeps Principle III's *product* framing intact while its actor clause is redefined, and it is
      why this amendment is smaller than the prohibition it reverses.
  A4. The seed REMAINS the development and test fixture, and seeded conferences become ORDINARY
      EDITABLE conferences. One class of conference; no privileged or immutable content. D2's
      "adding a conference is a reviewed change to committed seed data" ceases to be the only route
      and remains a valid one.
  A5. A report becomes readable inside the ADMINISTRATIVE product by a platform operator. FR-548's
      prohibition survives unchanged for MyNet itself. **What the queue may disclose is NOT decided
      here** and is register entry 24 — an in-product report surface that shows reported message
      text would need a third recorded exception under Principle VIII, and this amendment
      deliberately does not grant one.
  A6. Delivery is three features behind this one amendment: 011 (administrative foundation and the
      report queue), 012 (conference content authoring), 013 (registration and attendee
      management). 011 reserves migration 0009.

Five code-level guards enforce the reversed prohibition today. Each MUST be amended deliberately by
the feature that reaches it, and none may be weakened until it stops checking anything — the failure
mode 009 named for its own absence guards:
  - apps/api/src/db/seed/catalog.ts — its header asserts there is no write path and no import path
    at any privilege.
  - apps/api/tests/unit/catalog-read-only.test.ts — CatalogRepository declares no write method
    (FR-191), asserted by name-shape over its exports, so a write method fails by existing.
  - apps/api/tests/integration/join-grants-nothing.test.ts — a registration grants no write over
    conference content (FR-132, FR-134) and no surface creates, changes or revokes a join code
    (FR-311).
  - apps/api/tests/unit/qa-absences.test.ts — no answer, pin or moderation route on Q&A.
  - apps/api/tests/unit/no-report-read-surface.test.ts — no report read surface anywhere (FR-548).

Added binding constraints:
  - III. Attendee Experience First — the actor clause is redefined and the administration exclusion
    reversed, in place, with payment processing retained.
  - VI. Web-First Delivery — scoped explicitly to the attendee product, so the administrative site
    not being an installable PWA is a recorded absence rather than a silent breach.
  - VIII. Attendee Data Is Personal Data — records that this amendment grants NO third exception,
    and that a report surface disclosing message text would require one.
  - "Data scoping, content provenance, and composition" — D2's seed clause redefined per A4.
  - "Reporting conduct out of the product" — the in-product prohibition is narrowed to the attendee
    product rather than lifted, per A5.
  - "Administration, and the second actor" — NEW block, where A1–A6 live. It binds the two tiers,
    the separate-site rule, the absence rules MyNet must keep, and the obligations the
    administrative product inherits from Principles IV, VII, VIII and IX.

Register changes:
  - 19. ADDRESSED, not closed. 011 introduces the first actor in this project capable of moderating
    an avatar. The entry stays open because a capability is not a policy: who moderates, on what
    standard, and with what appeal is undecided.
  - 21. CHANGED, not closed. The question stops being "which mailbox" and becomes "who is the
    operator and what does the queue disclose". The mail path survives; what changes is that the
    dialog's promise can now be kept by a surface rather than only by an address.
  - 24. ADDED — what the administrative report queue may disclose. Created by A5.
  - 25. ADDED — what happens when a promoted conference organizer deletes their own account.
    Standing decision D6 guarantees self-serve hard deletion; a sole organizer exercising it orphans
    a conference whose content survives.
  - 26. ADDED — the administrative site's origin and session topology, against D11.
  - 4. ESCALATED again, without being answered. A second website is an entire product of unreviewed
    desktop design, and this entry has never been closed.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md — ✅ UPDATED, and the update uncovered a pre-existing drift
    with a cause worth recording. Principle IX's "Feature Declarations" section has been mandatory
    since 2.1.0, the delivery roadmap states that "the spec template carries the section", and **it
    did not**. Every shipped spec from 002 to 010 added it by hand, which worked only because each
    session read a neighbouring spec rather than the template.

    **The cause is that `.specify/templates/` is gitignored** — `.gitignore:29` ignores
    `**/.specify/**`, and `constitution.md` is tracked only because it was force-added past that
    rule. So the template was never shared, the roadmap's claim about it was never verifiable by
    anybody, and a fix to it could not have reached a second machine. **The template is therefore
    now force-added and tracked, exactly as `constitution.md` is**, because a mandatory section in
    an unshared file is not a requirement — it is a convention that survives only as long as
    somebody keeps copying it. *This changes what the repository tracks and is flagged for the
    owner to reverse if unintended.*

    The section now carries the twelve existing obligations plus a new first row: **Actor and
    tier**. Every feature through 010 had exactly one actor and never had to say so; from 011
    silence about the actor is an undeclared obligation.
  - .specify/templates/plan-template.md, tasks-template.md — ✅ no change required. Both are
    actor-agnostic; the plan template's Constitution Check reads "[Gates determined based on
    constitution file]" and so inherits this amendment without edit.
  - CLAUDE.md — ✅ FULLY updated at ratification. It carries A1–A6 as standing decisions **31–36**,
    entries 24, 25 and 26 as blockers on feature 011, and the five code-level guards. **Four
    pre-existing errors were corrected while reconciling it**, and they are listed because three
    were invisible until something depended on them: it cited the constitution as v3.3.0 (actual
    3.4.0); it said migrations run to 0007 (actual 0008); it **numbered the brand-mark decision 27,
    which the Q&A block already used** — the duplicate had stood since 3.4.0, and the brand mark is
    now decision 30; and it attributed the brand mark to **v3.3.0**, which is the Q&A amendment,
    where the constitution records **v3.4.0**. Its "no open question blocks any remaining feature,
    and there are no remaining features" claim was true only while administration was prohibited
    and is replaced rather than deleted.
  - brainstorm/00-overview.md — ✅ updated by brainstorm #09 on 2026-08-11.
  - docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — ✅ updated. Its Non-goals
    entry for organizer administration is struck through and annotated as reopened-pending-
    ratification. **Its reserved-migration table is deliberately NOT extended**: that document
    decomposes the attendee product and is complete, and administration is a second programme
    rather than its continuation. Recording 011–013 there would misrepresent a finished plan as
    unfinished.

Deferred: three register entries (24, 25, 26) are opened rather than answered, following 3.2.0's
precedent of leaving a question explicitly open for the phase told to answer it. Each is named above
with what it blocks.

PRIOR REPORT (3.3.0 → 3.4.0):

RATIFICATION STATUS: **RATIFIED 2026-08-10 by the project owner**, who supplied the brand board on
that date and ratified this amendment during the specification of feature 010. Drafted at his
request. The supply of the mark IS the client decision register entry 2 has been waiting for since
1.0.0 — no mark is invented here, and Principle I's prohibition on answering unasked questions is
what kept one from being invented earlier.

Rationale: MINOR. One register entry is resolved, one binding-constraint block is added, and one new
entry is opened. No principle is removed or redefined, nothing delivered is retracted, and **no work
performed under 3.2.0 is invalidated**.

**FR-050 is satisfied differently, not withdrawn.** 001 required icons at the sizes installation
needs and got them; the provisional set has always declared itself provisional, in a README titled
"PROVISIONAL, NOT BRANDING" and in an amber diagonal band drawn specifically so the placeholder could
not be mistaken for a decision. Replacing it is that plan completing, not a retraction — which is the
distinction from 3.0.0, where a delivered and verified requirement was actually withdrawn.

Owner decisions cited by this amendment (all 2026-08-10, recorded in
brainstorm/08-brand-mark-and-app-icons.md and in the four scope answers given during
specs/010-brand-mark-and-app-icons):
  B1. The supplied brand board is the brand source of truth. The mark is carried into the product by
      cropping from it; a vector redraw is a later change of input to the same pipeline.
      (Resolves register entry 2.)
  B2. Brand assets are DERIVED BY A READABLE SCRIPT, not committed as opaque binaries — preserving
      the convention the provisional generator established, so that a reviewer verifies crop
      geometry and plate colour by reading code.
  B3. The icon plate carries the BRAND's navy, not the design token's. Measured, not preferred: the
      board has no alpha channel, so the mark's antialiased edges are blends against its own navy
      and any other plate colour leaves a halo.
  B4. Whether the UI palette adopts the brand's navy and coral is DEFERRED, and the resulting seam
      between the icon plate and the token-derived theme_color is knowingly accepted. (Opens
      register entry 23.)
  B5. Scope is core-only: install icons, apple-touch icon, favicons, the in-app mark and manifest
      screenshots. The iOS splash matrix, the monochrome variant and the vector redraw are booked
      follow-ups, not silent omissions.

Added binding constraints:
  - "Brand identity and application icons" — where entry 2 now lives, on the same principle 3.1.0
    and 3.2.0 applied to entries 10, 7, 8 and 9: a struck-through entry is not where anybody looks
    for a rule. It binds the single source, derivation by readable script, the brand constants as a
    reasoned exception to the token rule, the prohibition on a raster lockup, and the requirement
    that a declared icon with no file fails the build.

Register changes:
  - 2. RESOLVED by B1. Struck through in place; numbering stable.
  - 4. NOT closed, and deliberately so. Feature 010 adds a visible element to the desktop and tablet
    bands, which ESCALATES this entry rather than answering it. An amendment that quietly took it
    would answer a question nobody asked (Principle I). The escalation is recorded on the entry.
  - 22. ADDED — whether the design tokens adopt the brand's navy and coral. Created by B4. Adding is
    permitted without a decision; this is an undecided matter that outlives feature 010, and leaving
    it in a feature specification alone would make it invisible to this register.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md — ✅ no change required.
  - .specify/templates/plan-template.md, tasks-template.md — ✅ no change required.
  - CLAUDE.md — ⚠ pending. Standing decisions list gains 27; open questions and current state
    understate what is settled.
  - brainstorm/00-overview.md — ⚠ pending, same reason.
  - docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — ⚠ pending. Its 010 section
    lists the brand mark as an unmet long-lead gate.
  - apps/web/public/icons/README.md — ⚠ pending, and superseded by feature 010 rather than edited
    here: its "Replacing them" checklist is what that feature executes.

Deferred: none as governance. Three product follow-ups are booked by feature 010 rather than by this
document — the iOS splash matrix, the monochrome variant, and the vector redraw — because each is a
scope decision inside a feature, not a rule of conduct.

PRIOR REPORT (3.1.0 → 3.2.0):
PRIOR REPORT (3.2.0 → 3.3.0), which landed on `develop` in feature 009 while this amendment
was in flight. **Both were ratified on 2026-08-10 and both were drafted as 3.3.0.** 009 merged
first, so it keeps that number and its register entry 22; this amendment renumbered to 3.4.0
and its open question became entry 23. Nothing published was rewritten, and the two remain
separate decisions because that is what they are — one licenses a Principle VIII exception for
audience Q&A, the other closes the brand-mark entry.

RATIFICATION STATUS: **RATIFIED 2026-08-10 by the project owner**, who accepted the Principle VIII
exception on reading it at 009's implementation gate. Phase 009 is licensed from this point; the
phase's own task list (T002) carried that precondition on the first line of code, and its plan
recorded the gate as BLOCKED rather than conditional. Follows 3.2.0's precedent: the amendment
travels in the feature branch and PR, so a reviewer reads the rule and the code that relies on it
together — which means a rebase that drops it un-licenses the code, and T002 says to re-check.

Rationale: MINOR. One recorded exception is added to an existing principle and one binding-constraint
block is extended. No principle is removed or redefined, nothing delivered is retracted, and **no
work performed under 3.2.0 is invalidated**. It is not PATCH because Principle VIII's "private
content stays private" clause gains a second exception, and an exception to a privacy rule is a
change in what the product may do — not a clarification of what it already did.

Owner decisions cited by this amendment (both 2026-08-10):
  Q1. Public Q&A visibility is a further exception to "private content stays private" and closes by
      amendment rather than by entailment. Ruled at 009's spec review: Principle VIII requires an
      exception to be *recorded*, not derived, and the one existing exception was recorded by
      amendment. The entailment argument — that attribution (N3, 3.2.0) already implies public
      visibility — was available and was not taken.
      **Count corrected at ratification**: 009's artifacts called this the *third* exception, on the
      reading that 3.2.0's N2 was a second. It was not. N2 makes a held card resolve the sharer's
      live profile past the **discoverability toggle** under a standing consent — an exception to
      being *found*, recorded under "Audience questions"' neighbouring blocks, never under "private
      content stays private", which enumerates its exceptions in place. This is the **second**.
  Q2. FR-756a is withdrawn from 009. A refused Q&A action does not purge the conference cache,
      because meeting that would give one feature a cross-feature responsibility no other
      undecorated repository has. The gap it named is real, product-wide, and older than 009, so it
      becomes register entry 22 rather than 009's to fix alone.

Added binding constraints:
  - VIII. Attendee Data Is Personal Data — "Private content stays private" gains its **second
    recorded exception**: audience questions are visible to every attendee registered for the event,
    under a real name, with **no opt-out**. Recorded with the thing that makes it different from the
    first: the profile exception (2.3.0, D10) is withdrawable and this one is not.
  - "Audience questions" — extended with the visibility rule and the three consequences that travel
    with it, so an exception is not recorded without its consequences and re-litigated later:
    attribution does not consult verification state, the author's name is not a route into their
    profile, and the attendee is told what will be published before they publish it. Records that
    reporting from a question is what makes the absence of a moderator survivable on the product's
    first many-to-many surface.
  - "Audience questions" — the deletion question this block left explicitly unsolved in 3.2.0 is
    **now answered by the phase that was told to answer it**, and the answer is recorded here rather
    than only in the spec: a departing attendee's question is removed, and other people's votes on it
    go with it. The obligation to decide is discharged, not deleted.

Register changes:
  - 22. CREATED by Q2. A cached conference can stay readable for up to 24 hours after the server
    begins refusing a withdrawn registration, because no undecorated repository purges on refusal.
    Against 010. This is the first entry created since 3.1.0, and it is created deliberately rather
    than absorbed: 009 declined to fix a product-wide gap from inside one feature, and an undeclared
    decline is indistinguishable from an oversight.
  - No entry is resolved by this amendment. Entry 9 was already resolved in 3.2.0; this amendment
    records the *consequence* the resolution carried, which is a different act.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md, plan-template.md, tasks-template.md — ✅ no change required.
  - CLAUDE.md — ⚠ pending. Its standing-decisions list and open-questions summary do not yet carry
    Q1, Q2 or entry 22. Already flagged as pending by 3.2.0 and still not reconciled.
  - brainstorm/00-overview.md — ⚠ pending, same reason, since 3.2.0.

Deferred: none. No placeholder tokens remain in this document.

PRIOR REPORT (3.1.0 → 3.2.0), retained because it is the precedent this amendment follows on both
counts — an owner ruling that closes by amendment, and an amendment travelling in the feature branch
whose code it gates:

Version change: 3.1.0 → 3.2.0

RATIFICATION STATUS: **RATIFIED 2026-08-10 by the project owner**, who answered three register
entries directly and ruled that they close by amendment rather than as immediately-binding client
decisions — following 3.1.0's precedent rather than 2.3.0's. Drafted at his request.

Rationale: MINOR. Three register entries are resolved and two binding-constraint blocks are added.
No principle is removed or redefined, nothing delivered is retracted, and **no work performed under
3.1.0 is invalidated**. The sharpening of standing decision 16 is not a redefinition: it makes
explicit a prohibition the clause already carried, and the only thing built against the other
reading was an unimplemented requirement in a draft specification, withdrawn before any migration
was written.

**This amendment closes the last register entries blocking a queued phase.** After it, entries 7, 8
and 9 are struck through and **no open entry blocks any remaining feature**. What stays open blocks
deployment (a domain, an Azure subscription, VAPID custody, the operator address) and release (brand
assets, desktop validation) — not code. That is a milestone worth recording, because for the life of
this project until now at least one queued phase has been unbuildable by governance.

Owner decisions cited by this amendment (all 2026-08-10; 7 and 8 recorded in
brainstorm/07-network-and-appointments.md):
  N1. A contact is someone whose digital business card you hold. No connect verb, no accept step.
      Contacts MUST NOT be derived from conversations. (Resolves register entry 7.)
  N2. Card sharing is one-directional and records the exchange, not the person. A held card resolves
      the sharer's live profile under a standing consent that outlives the event and the
      discoverability toggle. (Resolves register entry 8.)
  N3. Audience questions are attributed to their author, making Q&A a personal-data surface under
      Principle VIII. (Resolves register entry 9, unblocking 009 alongside 008.)
  N4. A card-only contact line WOULD breach standing decision 16. The field is withdrawn, and the
      clause is sharpened so the next feature does not re-litigate it.

Modified constraints:
  - "Attendee identity, personal data, and profile" — the profile-visibility clause is SHARPENED by
    N4. One visibility decision per attendee; no feature may give an individual field its own
    audience, however that audience is reached. Phase 008's rejected reading is recorded by name,
    because a rejected reading is more useful to the next reader than the rule alone.

Added binding constraints:
  - "Networking relationships and appointments" — where entries 7 and 8 now live, on the same
    principle 3.1.0 applied to entry 10: a resolved entry is not where anybody looks for a rule. It
    binds the contact model, one-directional sharing, live resolution under standing consent, the
    block as the only severing control, the proposed-then-accepted appointment, and the prohibition
    on slot availability disclosing anything about the invitee.
  - "Audience questions" — where entry 9 now lives. Attribution, the Principle VIII consequence
    stated as operative rather than noted, and an explicit refusal to let the Q&A phase assume 007's
    deletion answer transfers to a question other people have upvoted.

Register changes:
  - 7. RESOLVED by N1. Struck through in place; numbering stable.
  - 8. RESOLVED by N2. Struck through in place; numbering stable.
  - 9. RESOLVED by N3. Struck through in place; numbering stable.
  - No entry is created by this amendment. Phase 008's specification raised one candidate — the
    contact-line question — and it was answered in the same sitting rather than filed.

Templates and dependent artifacts:
  - .specify/templates/spec-template.md — ✅ no change required. Its "Register position" and
    "Event scoping" rows already carry these obligations generically.
  - .specify/templates/plan-template.md, tasks-template.md — ✅ no change required.
  - CLAUDE.md — ⚠ pending. Its standing-decisions list and open-questions summary are a working
    summary of this register and now understate what is settled.
  - brainstorm/00-overview.md — ⚠ pending, same reason.

Deferred: none. No placeholder tokens remain in this document.

PRIOR REPORT (3.0.0 → 3.1.0), retained because its reasoning about MINOR versus MAJOR is the
precedent this amendment relies on:

Version change: 3.0.0 → 3.1.0

RATIFICATION STATUS: **RATIFIED 2026-08-08 by the project owner**, who directed the implementing
session to proceed with phase 007's Web Push half on the strength of it. Drafted at his request; it
records decisions he had already taken (M4, M5, M7, M8, recorded 2026-08-07 in
brainstorm/06-messages.md) and one the implementation forced (the visibility capability).

Two values it deliberately does NOT invent — the push provider with its key custody, and the
operator address — are opened as register entries 20 and 21 rather than guessed. **Neither blocks
implementation**: the port is vendor-free and the sink adapter needs no provider, exactly as
`SinkMailService` needs none for entry 18. What entry 20 blocks is the real adapter, and therefore
delivery in a deployed environment.

Rationale: MINOR. A prohibition is lifted, Principle V's capability list gains a seventh device
interface, and a new binding-constraints block is added. No principle is removed or redefined, and
**no work performed under 3.0.0 is invalidated** — which is the distinction from 3.0.0 itself, where
two DELIVERED requirements were withdrawn and a shipped guarantee retracted.

The counter-argument was considered and rejected. Register entry 10 has bounded product scope since
1.0.0, and lifting it could be read as a redefinition of what MyNet *is*. That reading is wrong on
the versioning policy's own test: lifting a prohibition cannot make previously-compliant work
non-compliant, nothing built under it is invalidated, and the entry's operative half — the bell —
survives untouched. 2.3.0 is the closer precedent: it added `StorageService` as a seventh interface
and widened a product boundary, and was MINOR.

Owner decisions cited by this amendment (all 2026-08-07, recorded in brainstorm/06-messages.md):
  M4. Web Push is brought in, reversing the engagement-notification exclusion. `NotificationService`
      is wired to real delivery for the first time. (Resolves register entry 10, in part.)
  M5. Unread is a private per-participant read position. No read receipts, delivery ticks, typing
      indicators or presence.
  M7. Push payloads carry message content. Push and open-thread polling are two independent
      freshness paths, and the product is complete with only the second.
  M8. Reporting auto-blocks, records, and emails a configured operator address.

Modified principles:
  - V. Abstraction Before Platform and Data APIs — EXPANDED by one device capability,
    `VisibilityService`. Not a product decision: research R4 requires the open thread's poll to stop
    while the tab is hidden, the only way to ask is `document.visibilityState`, and
    `mynet/no-direct-platform-access` correctly refuses that in feature code. The alternatives were
    a lint exemption — trading a structural boundary for a poll interval — or dropping the
    condition, leaving a background tab polling forever. `packages/platform/tests/substitution.test
    .ts` is what forced this to be declared rather than added quietly: it asserted the list was
    exactly six and said a seventh "without an amendment is a decision nobody recorded".

Added binding constraints:
  - A new "Notification delivery" block. Entry 10's surviving half is written into binding text
    rather than left in a register entry that is about to be struck through — a resolved entry is
    not where anybody looks for a rule. It binds three things: no bell and no notification centre, a
    received message as the ONLY trigger, and the lock-screen consequence of M7 recorded as accepted
    rather than solved.

Register changes:
  - 10. RESOLVED IN PART, and the part that survives is PROMOTED to binding text. Engagement
    notification delivery enters product scope for a received message only. The prohibition on the
    notification bell is unchanged and now lives in "Notification delivery" above.
  - 18. UNCHANGED in substance, WIDENED in consequence. The transactional email provider now also
    carries operator abuse mail (M8), so an entry that blocked verification and recovery now also
    blocks a safety obligation.
  - 20. ADDED. The push provider and VAPID key custody — the project's second pending external
    dependency and secret, created by this amendment.
  - 21. ADDED. The operator address abuse reports are dispatched to, and the response expectation
    attached to it. M8 creates an obligation the owner personally holds.
  - 19. ESCALATED again. Open send plus permanent reachability means an unmoderated avatar is now
    also visible to anyone who can open a conversation, not only to conference co-attendees.

Templates and dependent artifacts:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ✅ .specify/templates/spec-template.md — no edit required.
  ✅ .specify/templates/tasks-template.md — no edit required.
  ⚠️ CLAUDE.md — MUST be updated in the same change. Its standing-decision list ends at 20 and needs
     the three this amendment ratifies; its "Out of product scope" line still excludes engagement
     notification delivery outright; and its open-questions summary needs resynchronising.
  ⚠️ packages/platform/src/interfaces/index.ts — `NotificationService`'s comment states the
     implementation "MUST NOT be wired to real delivery", which restates the entry this amendment
     reverses. It MUST be rewritten in the change that wires it, or the file contradicts itself.
  ✅ specs/007-messages-and-notification-delivery/ — this amendment is what its plan.md Constitution
     Check names as outstanding and what tasks.md Global Constraint 7 gates Phase 7 on.
  ⚠️ GroundZero/requirements.md — NOT edited. Its notification bell is prototype reference, and the
     bell remains forbidden regardless.

Deferred TODOs:
  - **Whether an attendee may suppress message content in notifications.** M7 puts message text on a
    lock screen; a per-attendee preference is the usual mitigation and was NOT decided. Recorded in
    "Notification delivery" as accepted rather than solved, and left open deliberately.
  - The push provider and the transactional email provider may well be answered together. Entries 18
    and 20 interact.

--- PRIOR REPORT: 3.0.0 ---
Version change: 2.3.0 → 3.0.0
Rationale: MAJOR. Principle VII's mandatory pipeline element "a preview deployment" is redefined in
a way that invalidates work performed under 2.x, and two DELIVERED requirements of phase 001 —
FR-066 and SC-011 — are withdrawn outright. The versioning policy's MAJOR test is "a principle is
removed or redefined in a backward-incompatible way", and the 2.0.0 precedent applied that test by
asking whether prior work is invalidated. It is: the `deploy-api` and `deploy-preview` jobs are
deleted, and a shipped guarantee to reviewers is retracted.

The counter-argument was considered and rejected. Relaxing a requirement cannot make
previously-compliant work non-compliant, so this could be read as MINOR. That reading is wrong here
because the change is not a relaxation of a rule nobody relied on: FR-066 and SC-011 were built,
verified, and are what a reviewer was promised. Retracting a delivered guarantee is a
backward-incompatible redefinition from the standpoint of everyone who relied on it, and recording
it as MINOR would understate what is being given up.

Decisions cited by this amendment (all 2026-08-07, recorded in
brainstorm/05-discover-and-the-deployment-platform.md):
  D11. Client and API share one origin. The topology decision and the CSRF defence are one decision.
       (Underlies the Principle VII and deployment changes.)
  D12. Production and UAT are Azure VMs on the mission-control/deploy/vm pattern — Caddy with
       automatic TLS in front of an API container and a loopback-only PostgreSQL container.
       (Resolves register entry 11.)
  D13. Preview becomes one long-lived UAT environment rather than per-pull-request ephemeral
       environments. (Supersedes 001 FR-066 and SC-011; changes register entry 14; resolves the
       remainder of entry 17 by replacement.)

Modified principles:
  - VII. Verified on Linux CI — REDEFINED. The pipeline's required elements no longer include a
    per-change preview deployment. A deployment to a long-lived UAT environment on merge to
    `develop` satisfies the requirement. Every correctness gate is unchanged, and the breach clause
    added in 2.2.0 is unchanged.

Modified binding constraints:
  - Technology and Architecture Constraints, "Backend and API" — the database is no longer required
    to be MANAGED. PostgreSQL itself is unchanged, as are the project-owned API contract, versioned
    reviewed migrations verified in CI before reaching real data, and repository-interface data
    access. Only who provisions the database changes.
  - A new "Deployment environments" block records what replaces the per-change preview: two isolated
    environments, the data-separation rule carried forward from 001 FR-067, and the backup and
    restore obligation.

Withdrawn requirements from a shipped feature:
  - specs/001-production-foundation/spec.md FR-066 and SC-011 are SUPERSEDED. What replaces the
    reviewer-facing guarantee is stated in the "Deployment environments" block: review against UAT
    after merge, plus a locally reproducible stack, with the reduction in per-change reviewability
    recorded as accepted rather than solved. 001's FR-067 SURVIVES and is carried forward by 006's
    FR-485.

Register changes:
  - 11. RESOLVED. API hosting, the PostgreSQL provider and object storage — Azure VMs, PostgreSQL in
    the stack, StorageService on a VM volume.
  - 14. CHANGED, not closed. Cloudflare Pages previews are withdrawn; a long-lived, publicly
    reachable UAT replaces them, so the access-control question survives in a sharper form.
  - 17. Remainder RESOLVED BY REPLACEMENT rather than by provisioning. `db-branch`, `schema-diff`,
    `deploy-api` and `deploy-preview` are deleted, so NEON_API_KEY, NEON_PROJECT_ID, FLY_API_TOKEN
    and the three Cloudflare values are no longer needed. NO CHECK WAS WEAKENED — the jobs removed
    verify nothing about correctness, and all ten that do are unchanged.
  - 4. ESCALATED. Discover is card-dense at all three widths and adds a second overlay.
  - 19. ESCALATED. Discover broadcasts avatar images to every co-attendee, converting an unmoderated
    upload from a private artifact into a published one.

Register numbering remains STABLE, per 2.3.0. Resolved entries are struck through IN PLACE.

Templates and dependent artifacts:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ✅ .specify/templates/spec-template.md — no edit required. The Principle IX declaration rows are
     unchanged by this amendment. The 2.3.0 tracking caveat still applies: `**/.specify/**` is
     gitignored except `memory/`, so any template edit lives in one clone until `spex init
     --refresh` overwrites it.
  ✅ .specify/templates/tasks-template.md — no edit required; task categories are unaffected.
  ✅ CLAUDE.md — updated in this change. Four restatements of "managed PostgreSQL" and the CI
     requirement's "preview deploy on every change" are corrected, and the register summary is
     resynchronised.
  ⚠️ specs/001-production-foundation/spec.md — NOT edited. FR-066 and SC-011 are superseded by this
     amendment, not rewritten. A shipped specification records what was decided and built at the
     time; editing it retroactively would destroy the very record that makes this supersession
     legible. The supersession is recorded here and in 006's specification.
  ✅ specs/006-discover-and-deployment-platform/ — this amendment is what its T001 requires and what
     its Complexity Tracking names as a merge prerequisite.
  ✅ brainstorm/00-overview.md — updated on the brainstorm branch ahead of this amendment.
  ✅ docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — NOT edited. It is a plan
     rather than governance; 006 departs from it and says so in its specification.

Deferred TODOs:
  - No domain name exists. Caddy cannot obtain a certificate until an A record resolves. Blocks the
    first deploy, not this amendment.
  - UAT access control is undecided — register entry 14, in its new form.
  - The 2.0.0 report above states "Architecture: custom API over managed PostgreSQL" at decision 4.
    That line is a HISTORICAL RECORD of what was decided on 2026-08-04 and is deliberately NOT
    edited. It was true then. This amendment supersedes it; falsifying the record would be worse
    than leaving it superseded.

--- PRIOR REPORT: 2.3.0 ---
Version change: 2.2.0 → 2.3.0
Rationale: MINOR. Three register entries are resolved by client and owner decision, one principle is
materially expanded, one gains a seventh interface, one product-boundary statement is narrowed, and a
new binding-constraints block is added. No principle is removed or redefined, and no work performed
under 2.2.0 is invalidated.

This amendment records real decisions rather than corrections of fact. They were taken on 2026-08-07
in brainstorm #04 (brainstorm/04-attendee-identity-and-profile.md). The project owner confirmed at
the outset of that session that he speaks for the client on the two client-owned entries, so entries
5 and 6 are closed as client decisions rather than as owner assumptions.

Decisions cited by this amendment (all 2026-08-07, recorded in
brainstorm/04-attendee-identity-and-profile.md):
  D5. Attendee identity model — self sign-up with an event join code carried on the seeded event
      row, delivered entirely within phase 004. No issuer, no privileged role, no import path.
      (Resolves register entry 5.)
  D6. Data retention, deletion and export — full self-serve. Hard deletion with cascade and no
      tombstone, machine-readable export, and a retention clock for records no cascade can reach.
      (Resolves register entry 6.)
  D7. Attendee avatar handling — real upload, with resizing and EXIF stripping mandatory.
      (Resolves register entry 13.)
  D8. Transactional account mail is in scope and is distinct from notification delivery.
  D9. Avatar bytes go through a StorageService platform interface; the provider folds into entry 11.
  D10. Profile visibility — co-attendees at the same event, with a single discoverability toggle.

Modified principles:
  - IX. Every Feature Declares Its Own Completeness — expanded by one declaration: "Deletion and
    export coverage". D6 makes deletion and export a per-feature duty owed in the change that
    introduces the data, and Principle IX exists precisely because an obligation stated in one place
    and owed in another gets built by nobody.
  - V. Abstraction Before Platform and Data APIs — expanded. StorageService joins the capability
    list as a seventh interface, with a note that it is a platform capability rather than a device
    one, so the list is not read as closed to non-device surfaces.
  - VIII. Attendee Data Is Personal Data — materially expanded. Deletion and export were stated as
    "recognised obligations" whose absence must be recorded. D6 turns them into concrete standing
    commitments: self-serve, hard, cascading deletion; machine-readable export; and a retention
    clock for personal-data records that no cascade can reach. A new clause records co-attendee
    profile visibility as the exception "private content stays private" requires to be recorded.

Expanded sections:
  - Technology and Architecture Constraints → Product boundaries. The notification exclusion is
    narrowed to engagement notifications; transactional account mail is in scope per D8. The
    notification bell remains forbidden, which is the thing the exclusion was protecting.
  - Technology and Architecture Constraints → new "Attendee identity, personal data, and profile"
    block recording D5–D10 as binding constraints, in the same form as the D1–D3 block added by
    2.1.0.

Resolved register entries — moved to a new "Resolved in 2.3.0" block:
  - 5. Attendee identity model — by D5. Recorded with it: three of the entry's four candidates
    (event invitation, organizer-provisioned, ticket holder) were never available under Principle
    III or under the seed-data clause of the content-provenance constraint. The entry overstated the
    choice from the day it was written.
  - 6. Data retention, deletion and export — by D6. This supersedes the narrow declared commitment
    phase 005 shipped under, and it makes 005's ON DELETE CASCADE reachable for the first time:
    that cascade has been operationally unreachable since it shipped, because no delete-account
    route exists anywhere in apps/api.
  - 13. Attendee avatar handling — by D7.

Added register entries — numbered 18 and 19, continuing the sequence:
  - 18. The transactional email provider (owner/planning). D8 settles that account mail is sent, not
    by whom.
  - 19. Nobody moderates uploaded avatar images. Public sign-up plus image upload, with no admin
    actor, and the organizer-administration exclusion forecloses the usual answer.

Register numbering is now STABLE. Version 2.1.0 renumbered the register when it resolved entries;
this amendment does not, and the practice is discontinued. The reason is citability: entries are now
referenced by number in CLAUDE.md, in brainstorm/00-overview.md, and in commit messages that cannot
be edited, and a register whose numbers move under those references cannot be cited reliably.

Resolved entries are struck through IN PLACE rather than deleted, with the detail moved to the
"Resolved in 2.3.0" block. Leaving gaps was tried first and is wrong: Markdown renderers ignore
explicit ordinals in an ordered list and renumber sequentially, so a source gap at 5 and 6 would
render entry 7 as "5" — the stable numbering would hold in the source and be false on the page.

Templates and dependent artifacts:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ⚠️ .specify/templates/spec-template.md — edited locally with a matching "Deletion & export
     coverage" row, but the edit is NOT COMMITTED AND CANNOT BE. .gitignore ignores `**/.specify/**`
     and un-ignores only `memory/` and `memory/constitution.md`, so every template is untracked and
     the change lives in this clone alone until `spex init --refresh` overwrites it.

     Worth recording plainly, because it applies retroactively: the 2.1.0 and 2.2.0 reports above
     both carry ✅ entries for template files, and none of those edits were committed either. Any
     ✅ against a `.specify/templates/` path in this file describes a working-copy edit, not a
     versioned artifact.

     The obligation is therefore carried in **Principle IX**, which is committed, rather than
     resting on the template. Where the two disagree, Principle IX is what binds — the template is a
     convenience that renders it.
  ✅ .specify/templates/tasks-template.md — no edit required; task categories are unaffected. Same
     tracking caveat applies had one been needed.
  ✅ CLAUDE.md — updated in this change. Its open-questions summary listed all three now-resolved
     entries as blocking 004, and its constraints did not carry D5–D10.
  ✅ brainstorm/00-overview.md — updated in this change, on the same branch, ahead of this
     amendment. Records the same six decisions and the twelve questions left open.
  ✅ docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — NOT edited. The roadmap is
     a plan rather than governance and may be revised without an amendment; 004 now departs from it
     substantially, and per Governance that departure is stated in 004's specification rather than
     by rewriting the roadmap retroactively.
  ✅ specs/005-agenda-and-saved-sessions/ — unaffected as a specification. Its narrow declared
     commitment was correct under 2.2.0 and is superseded rather than invalidated; 004 is the phase
     that discharges the fuller obligation.

Deferred TODOs:
  - Entry 17 (the preview path — Fly, Cloudflare and Neon provisioning) remains open and unchanged.
  - GroundZero/requirements.md remains knowingly out of step (register entry 3). Unchanged.
  - Which jurisdiction's data-protection regime applies is NOT recorded as a register entry. D6
    deliberately builds to the strict standard so that settling it is not a precondition for 004;
    it is carried in brainstorm #04 as a design question against the retention window.

--- PRIOR REPORT: 2.2.0 ---
Version change: 2.1.0 → 2.2.0
Rationale: MINOR. Principle VII is materially expanded with a breach clause, and three register
entries are corrected against verified evidence while two are added. No principle is removed or
redefined, and no work performed under 2.1.0 is invalidated.

This amendment records no new owner decision. It corrects statements of fact that were wrong, and
adds entries for facts that were true but unrecorded. Evidence was gathered from the GitHub API on
2026-08-07 rather than from any prior document, because two prior documents disagreed.

Modified principles:
  - VII. Verified on Linux CI — expanded. The principle stated "a change is not complete until the
    pipeline is green" without naming the consequence of merging anyway. It now defines merging with
    a failing, skipped, cancelled, or never-started required check as a governance breach, requires
    a recorded waiver naming the unsatisfied checks and who accepted the risk, and states that
    skipped later stages MUST NOT be read as absence of problems.

Corrected sections (factual errors, verified 2026-08-07):
  - Branching and Change Flow → Enforcement. Said server-side branch protection was "unavailable
    (private repository on a free personal account; the branch-protection and ruleset APIs both
    return 403)" and that making the repository public or upgrading to GitHub Pro was required.
    Every part of that was false: the repository is PUBLIC and organisation-owned, the protection
    endpoints return 404 (no rule set), rulesets returns [], and protection is free on public
    repositories. The gap is unconfigured, not unavailable — a configuration task, not a risk to
    accept.
  - Register entry 6 (data retention/deletion/export). Justified blocking 004 by calling it "the
    first to store substantial personal data". It is not first; 005 ships first and stores the
    product's first attendee-authored free text as personal session notes. The block on 004 stands
    on other grounds; the justification was corrected and 005's narrow declared commitment recorded.
  - Register entry 15 (branch protection). Same false premise as the Enforcement paragraph.

Added register entries:
  - 16. Repository visibility — public and organisation-owned, previously unrecorded anywhere in
    this constitution. Changes the Principle VIII threat model; interacts with entry 14.
  - 17. (Substantially closed 2026-08-07 — the correctness gates now run; the preview path remains
    unprovisioned.) The pipeline runs red and most Principle VII checks have never executed. Features 001 and
    002 merged in this state. Must be waived or closed before 005 merges.

Templates and dependent artifacts:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ✅ .specify/templates/spec-template.md — no edit required. Its Principle IX declaration table
     already carries the rows this amendment touches; nothing in 2.2.0 adds a declaration category.
  ✅ .specify/templates/tasks-template.md — no edit required; task categories are unaffected.
  ✅ CLAUDE.md — updated in this change. Carried the same false branch-protection claim in two
     places and the same "first to store substantial personal data" error.
  ✅ .githooks/README.md — updated in this change. Carried the false claim and additionally named
     the repository as `daperezu/mynet-ps`, which is no longer where it lives.
  ⚠️ brainstorm/00-overview.md — pending, and deliberately not edited here. Its CI entry says runs
     have "never started", which was true when written and is now wrong in a new way: they run and
     fail. The file self-declares as subordinate to this register, so it is stale rather than
     conflicting. It is corrected on the branch carrying brainstorm #03.
  ✅ specs/001-production-foundation/, specs/002-event-context-and-catalog/ — unaffected as
     specifications. Both features merged in breach of the clause added to Principle VII; that is
     recorded as register entry 17 rather than retro-applied to their specs.
  ✅ specs/005-agenda-and-saved-sessions/ — unaffected. Its Register position declaration already
     states the entry-6 correction this amendment ratifies, and its Dependencies section already
     states that its guarantees are documentation until CI runs.

Deferred TODOs:
  - Entry 17 requires a waiver or a fix. This amendment records the breach; it does not resolve it,
    and resolving it is code and pipeline work outside a constitution amendment.
  - GroundZero/requirements.md remains knowingly out of step (register entry 3). Unchanged.

--- PRIOR REPORT: 2.1.0 ---
Version change: 2.0.0 → 2.1.0
Rationale: MINOR. One principle added, two sections materially expanded, three Open Questions
Register entries resolved. No principle is removed or redefined, and no work performed under 2.0.0
is invalidated.

Owner decisions cited by this amendment (all 2026-08-06, recorded in
docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md):
  D1. Event scoping is hybrid. Conference content — sessions, tracks, speakers, the Discover
      directory, appointments — is per-event. Relationships — contacts, exchanged cards, message
      threads — persist across events. (Resolves register entry "Event scoping of data".)
  D2. Conference content is seeded; each attendee authors their own profile. No administrative
      interface, and no content import path.
  D3. Home is a slot-based card registry built early, not a dashboard aggregated late.
  D4. Phases run mostly sequentially, in parallel only where they touch disjoint files.

Added principles:
  - IX. Every Feature Declares Its Own Completeness
Expanded sections:
  - Technology and Architecture Constraints → new "Data scoping, content provenance, and
    composition" block recording D1, D2, D3 as binding constraints.
  - Branching and Change Flow → new "Parallel work and shared artifacts" block recording D4's
    coordination protocol.
  - Governance → the delivery roadmap is named as the authoritative decomposition.
  - Governance → Open Questions Register (three entries resolved, two added, all renumbered).

Resolved register entries:
  - "Event scoping of data" (was #6) — by D1.
  - "Attendee profile view" (was #9) — a profile detail view is delivered in phase 006.
  - "Repository shape" (was #12) — the API lives in this repository at apps/api.

Added register entries:
  - Audience-question attribution (client decision) — blocks phase 009.
  - Attendee avatar handling (owner decision) — blocks phase 004.

Templates and dependent artifacts:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ✅ .specify/templates/spec-template.md — updated. Principle IX makes a per-feature declaration
     mandatory, so the template now carries a "Feature Declarations" section.
  ✅ .specify/templates/tasks-template.md — task categories already accommodate the declared
     obligations; no edit required.
  ✅ CLAUDE.md — updated in this change. Its open-questions summary listed the three now-resolved
     entries, and its constraints did not carry D1–D3.
  ✅ docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md — the decision record this
     amendment cites. Unchanged by it.
  ✅ specs/001-production-foundation/ — unaffected. Nothing in 2.1.0 contradicts the delivered
     slice; Principle IX applies to specifications written after this amendment.

Deferred TODOs:
  - GroundZero/requirements.md remains knowingly out of step (open question, client decision).
    Unchanged by this amendment.

--- PRIOR REPORT: 2.0.0 ---
Version change: 1.1.0 → 2.0.0
Rationale: MAJOR. The project owner decided on 2026-08-04 that MyNet is the real product, not a
front-end demo, and that durable persistence and real authentication are foundational rather than
deferred. This redefines principles in a backward-incompatible way: the "no external services, no
real authentication, no durable storage" boundary is removed, Principle I is reframed, Principle V
is widened, and Principle VI's backend bar is lifted. Work performed under 1.x that assumed a
stateless front-end demo is invalidated.

Owner decisions cited by this amendment (all 2026-08-04):
  1. Product name is MyNet. (Resolves a 1.x Open Questions Register entry.)
  2. MyNet is the real product. The demo framing is withdrawn.
  3. requirements.md is authoritative for WHAT the product is, not HOW it is delivered.
  4. Durable persistence is foundational. Architecture: custom API over managed PostgreSQL.
  5. Real authentication is foundational, not a later slice.
  6. Five destinations are individually addressable (overrides the "single-route" wording).

Modified principles:
  - I. "Requirements Are the Source of Truth" → "Requirements Define the Product, Not the Delivery
    Mode". Adds the WHAT/HOW classification that the owner decision requires.
  - III. Attendee Experience First — "authenticated attendee workspace" is now literal, not a feel.
  - V. "Platform Abstraction Before Platform APIs" → "Abstraction Before Platform and Data APIs".
    Extended to cover data access, which 1.x left uncovered.
  - VI. Web-First Delivery — the bar on backends and synchronization is lifted; native-only-on-
    trigger is retained unchanged.
  - VII. Verified on Linux CI — extended to cover the API, database migrations, and integration
    tests.
Added principles:
  - VIII. Attendee Data Is Personal Data
Rewritten sections:
  - Technology and Architecture Constraints (Data and boundaries; Persistence; new Backend and API;
    new Data access)
  - Governance → Open Questions Register (one entry resolved, five added)
Removed: the demo-scope boundary in all its forms.

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check resolves against this file at plan
     time; no static edit required.
  ✅ .specify/templates/spec-template.md — structure remains compatible.
  ✅ .specify/templates/tasks-template.md — task categories accommodate backend, migration, and
     security task types.
  ⚠️ CLAUDE.md — MUST be updated in the same change; its Business rules, Technology stack, and Open
     questions sections all still describe the 1.x demo scope.
  ⚠️ specs/001-production-foundation/ — written under 1.x. Invalidated by this amendment and being
     rewritten.
  ⚠️ brainstorm/01-foundation-slice.md — decision recorded under 1.x. A dated revisit section is
     required rather than a silent edit.

Deferred TODOs:
  - GroundZero/requirements.md still says "EventLink", still describes a front-end demo, and still
    lists persistent databases and real authentication as out of scope. Whether it is amended or
    the divergence is simply recorded is an open question requiring the client, not the owner.

--- PRIOR REPORT: 1.1.0 ---
Added the "Branching and Change Flow" section. Enforcement artifacts: .githooks/pre-commit,
.githooks/pre-push, .githooks/README.md. Known gap: GitHub server-side branch protection returns
403 on a private free-tier repository.

--- PRIOR REPORT: 1.0.0 ---
Initial ratification. Principles I–VII, Technology and Architecture Constraints, Development
Workflow and Quality Gates, Governance with Open Questions Register and Amendment Procedure.
-->

# MyNet Constitution

## Core Principles

### I. Requirements Define the Product, Not the Delivery Mode

`GroundZero/requirements.md` is the authoritative statement of **what MyNet is**: who it serves,
what it does, how it looks, and what "finished" means. It is **not** authoritative on how the
product is built, hosted, or persisted.

Every statement in an authoritative source MUST be classified before it is relied upon:

- **WHAT (binding)** — actors, capabilities, destinations, workflows, domain terminology, visual
  direction, accessibility obligations, responsive obligations, empty and error states, success
  criteria, and anything explicitly excluded from the *product*.
- **HOW (not binding)** — statements describing the original demo delivery mode: single-route
  construction, in-file constants, absence of network requests, absence of durable storage,
  absence of authentication, and state resetting on reload.

Sources MUST be consulted in this priority order:

1. Recorded owner or client decisions (this document, and decisions cited by its amendments)
2. `GroundZero/requirements.md`, read for WHAT
3. Client-provided reference images
4. `GroundZero/prototype/` (approved interaction and presentation reference)
5. Existing source code (implementation reference only)

When sources conflict on a **WHAT**, the conflict MUST be recorded in the Open Questions Register
and resolved with the client. Resolving a WHAT conflict by assumption, inference, or convenience is
prohibited. No specification, plan, or implementation may introduce capabilities, data models, or
business rules that are not traceable to an authoritative source or to an explicitly recorded
decision.

**Rationale**: The client approved a product, and the prototype demonstrated it through the
cheapest available delivery mode. Treating that delivery mode as a requirement confused an artifact
of prototyping with a decision the client made. Separating the two lets the product stay
authoritative while the architecture serves it. The register still binds: this principle widens
what may be decided, it does not permit deciding silently.

### II. The Prototype Is Reference, Not Architecture

`GroundZero/prototype/` is an approved **visual and interaction** reference. Its architecture, file
layout, state model, dependency list, styling technique, and code quality carry no authority and
MUST NOT be preserved by default.

Legitimate uses: interaction flows, screen composition, copy, sample-data *shape*, visual language.
Every structural decision the prototype embodies MUST be re-decided explicitly for production, and
the decision recorded in the feature plan.

**Rationale**: Client approval of the prototype validates product direction only. Treating a
1,400-line single-file Figma Make export as a starting architecture would import decisions nobody
made.

### III. Attendee Experience First

The attendee is the **primary** actor, and MyNet — the attendee product — has no other. *Amended
4.0.0 by A1 and A2: from 1.0.0 until this amendment this clause read "the attendee is the only actor
in scope", and every feature through 010 was justified against it. A second actor now exists, and it
does not act in this product.* What survives unchanged is the rule that gave the original clause its
force: **no administrative capability may appear in MyNet itself** — no admin surface, no privileged
view, no role-dependent rendering — so an attendee's experience of this product is exactly what it
was. The second actor and its own product are defined under "Administration, and the second actor".

Every feature of the attendee product MUST be justified by how it answers one of the attendee's
three questions, in this order of prominence:

1. What is happening next?
2. Who should I meet?
3. Where are my conversations, notes, and appointments?

The product IS an authenticated attendee workspace — literally, not as an aesthetic. It MUST NOT
read as a marketing site and MUST NOT read as a generic enterprise dashboard. People, sessions, and
time MUST be the strongest visual elements. The first viewport MUST make the product understandable
without scrolling, and the core journey — inspect the next session → discover a relevant attendee →
share a card or message them → schedule a networking appointment — MUST remain completable end to
end.

**Payment processing** is out of **product** scope and MUST NOT be built without an amendment. Its
exclusion is a WHAT, not a delivery-mode artifact.

**Administration is IN scope as of 4.0.0** (A1), and the exclusion that stood here since 1.0.0 is
reversed. *(**RATIFIED 2026-08-11.** The amendment travels on the feature branch to `develop` — the
pattern 3.2.0 established, so that a reviewer reads the rule and the code relying on it together,
which also means a rebase dropping it un-licenses that code.)* The two were named in one sentence and were never one decision; reversing one does not
weaken the other. Administration enters under four conditions, each binding and stated in full under
"Administration, and the second actor": it lives in a **separate product**, it is exercised by a
**second actor in two tiers**, **neither tier is reachable by self sign-up**, and **MyNet gains no
administrative surface**. An administrative capability that fails any one of those four is outside
this reversal and needs its own amendment.

**Rationale**: This is the stated success criterion, and it is unchanged for the attendee. A feature
of the attendee product that does not serve it is scope creep regardless of its merit. The reversal
was forced by obligations the product had already accumulated and could not discharge: register
entry 19 has been open since 2026-08-07 because nobody moderates an uploaded avatar, entry 21 since
2026-08-08 because the reporting dialog promises a human reader the product cannot supply, and 009
recorded that a public Q&A surface "needs a moderator, and a moderator is an organizer — the actor
Principle III excludes by construction". An exclusion that makes a safety promise unkeepable is an
exclusion that has to be paid for or reversed.

### IV. Accessibility and Responsiveness Are Non-Negotiable

Every interactive control MUST have an accessible label, a visible focus state, and keyboard
operability. Modals MUST have a clear close action and Escape-key dismissal. Focus states MUST NOT
be removed (`focus:outline-none` without an equivalent visible replacement is a defect).

Three layouts MUST be delivered and verified:

- **Desktop**: persistent left navigation rail, contextual top bar, multi-column dashboard
- **Tablet**: reduced rail, two-column cards, stacked detail areas
- **Mobile**: compact header, bottom navigation, single-column cards, full-width overlays,
  touch-sized controls

No content and no primary action may require horizontal scrolling at any supported width.

The required empty and error states MUST exist: no attendee search results (message + reset action),
no saved sessions (invitation to explore), empty thread (conversation-starter prompt), no meeting
slots (explanation + close), and invalid empty message or meeting topic (**disabled confirmation**,
never a post-submit error). Now that data is fetched rather than embedded, **loading and failure
states are equally required** wherever data crosses the network.

**Rationale**: The prototype implements none of the focus or Escape behavior and has no desktop or
tablet layout at all. These are requirements, not enhancements, and they are cheap to keep and
expensive to retrofit.

### V. Abstraction Before Platform and Data APIs

Application code MUST call project-owned interfaces, never external APIs directly. This applies in
two dimensions:

**Device and browser capabilities** — `NotificationService`, `CalendarService`, `CameraService`,
`ContactShareService`, `SecureStorage`, `ConnectivityService`, and `VisibilityService` (added 3.1.0;
whether the attendee is actually looking at this tab). Initial implementations MAY be web-based or
no-op stubs.

`VisibilityService` is listed for a reason worth stating, because it is the first capability added
by an implementation rather than by a product decision. A surface that polls MUST NOT poll a tab
nobody is looking at — a backgrounded tab has its timers throttled unpredictably, so a poll that
"runs" there fires in bursts when the tab wakes, on a phone, on cellular data. The only way to ask
is `document.visibilityState`, and this principle forbids feature code from asking it directly. The
choice was therefore an interface or an exemption, and an exemption would have traded a structural
boundary for a poll interval.

**Platform capabilities** — `StorageService`, for durable binary content that does not belong in the
database (added 2.3.0 by D9, for avatar images). This is a *platform* capability rather than a device
one, and it is listed separately so the capability set is not read as closed to surfaces that are
neither device nor data-access. Its initial implementation MAY be filesystem- or database-backed for
development, test, and preview; the production provider is a separate, recorded decision.

**Data access** — feature and presentation code MUST NOT call the network, construct requests, or
know transport details. It MUST obtain data through project-owned repository interfaces expressed
in domain terms. Swapping the implementation behind a repository MUST NOT require changes to
feature code.

Any new capability that touches a device, platform, or network surface MUST be introduced behind an
interface in the same change that introduces it. A direct call to a platform API or to the network
from feature code is a Constitution Check failure and MUST be recorded in Complexity Tracking with
justification, or refactored.

**Rationale**: The device half is what makes a later native move a packaging change rather than a
rewrite. The data half is the same argument applied where it now matters more — with a real API,
transport details leaking into components is the defect that makes every future change expensive.
Version 1.x mandated the first and omitted the second; that omission is corrected here.

### VI. Web-First Delivery, Native Only on Trigger

The **attendee** client product MUST be built as an installable PWA: web app manifest, application
icons, offline shell, versioned caching, and explicit online/offline states.

*Scoped explicitly in 4.0.0 by A3.* Until this amendment there was one client and the word needed no
qualifier. The administrative product is a second client, and this principle does **not** bind it:
an administrator works at a desk on a connection, not in a venue on a phone, so an offline shell and
an install prompt would be ceremony rather than capability. **Whether the administrative site is
installable MUST nevertheless be stated in its specification as a declared absence** under Principle
IX — an obligation that is not declared is presumed unmet, and "this principle does not apply" is
exactly the kind of claim that must be made out loud rather than inferred from silence.

MyNet is a networked product with durable server-side state. Offline behaviour MUST therefore be
**explicit and bounded**: what is available offline, what is not, and what happens to an action
attempted offline MUST be specified per feature rather than assumed. Optimistic updates and
conflict resolution MUST NOT be introduced speculatively — each requires a recorded decision naming
the conflict semantics it adopts.

Capacitor or another native wrapper MUST NOT be adopted unless at least one trigger is documented as
having occurred:

1. App Store distribution has become mandatory, or
2. A required capability is not adequately available on the web platform, or
3. Field testing shows PWA installation materially harms adoption.

When a trigger fires, use Codemagic or Bitrise for iOS builds and signing, TestFlight for beta, and
Google Play internal testing for Android. Reconsider React Native + Expo only if the roadmap becomes
app-store-first with multiple native integrations; reconsider Flutter only if rich animation or
bespoke rendering becomes a defining requirement; .NET MAUI only for a strongly C#/.NET team.
Xamarin and Unity are not permitted.

At least one **physical iPhone** MUST be exercised before any production release — installation,
safe areas, keyboard behavior, gestures, permissions, and WebView behavior.

**Rationale**: The ranked recommendation exists so the stack is chosen by evidence rather than by
preference at an inconvenient moment. Version 1.x additionally barred backends and synchronization;
that bar is lifted by owner decision. What replaces it is not permission to synchronize freely but a
requirement to decide offline semantics deliberately, per feature.

### VII. Verified on Linux CI

Every change MUST pass an automated pipeline that runs on Linux with no Apple infrastructure. The
pipeline MUST cover both the client and the API: type checking, linting, unit tests, component
tests, **API contract tests**, **database migration verification**, **integration tests against a
real database instance**, accessibility checks, end-to-end browser tests, and a production build.

**A per-change preview deployment is NOT required** (amended 3.0.0, decision D13). A change MUST
reach a **deployed environment** before it reaches production, but that environment is the
long-lived UAT described under "Deployment environments" below, deployed on merge to `develop` —
not an ephemeral environment built for each pull request.

This supersedes phase 001's **FR-066** and **SC-011**, which are the strongest form of the earlier
reading: *"a preview of that exact change at an address a reviewer can open without local setup"*.
Both are withdrawn. **What is given up is stated plainly rather than glossed**: a reviewer no longer
sees the change they are reviewing, deployed, before approving it. What replaces it is review
against UAT *after* merge plus a locally reproducible stack, and the residual reduction in
per-change reviewability is **accepted, not solved**.

001's **FR-067** — no environment holding real attendee data may back a non-production deployment —
is **unaffected and survives**. It binds UAT exactly as it bound previews.

A change is not complete until the pipeline is green. Completion MUST NOT be claimed from
inspection; it MUST be claimed from pipeline output. Failing or skipped checks MUST be reported
explicitly, never silently tolerated.

**Merging with a required check failing, skipped, cancelled, or never started is a governance
breach.** A check that did not run has not passed, and a pipeline whose later stages are skipped
because an earlier stage failed has verified nothing beyond the point of failure — the skipped
stages MUST NOT be read as absence of problems. Where such a merge is nevertheless judged
necessary, it MUST carry a **recorded waiver** naming the checks not satisfied, why the merge could
not wait, and who accepted the risk. An unwaived breach MUST be recorded in the Open Questions
Register and MUST be closed before the next feature merges. Silence is not a waiver, and a green
subset is not a green pipeline.

*Rationale*: this principle previously stated the standard without naming the consequence of
breaking it, and the standard was then broken twice — features 001 and 002 both merged with the
migration, integration, accessibility and end-to-end stages unexecuted. A rule with no stated breach
condition is guidance; this makes it a gate.

The requirements validation checklist — production build success, desktop and mobile rendering,
navigation and event switching, search and filter, session save + notes + Q&A, message composition,
card-sharing feedback, meeting scheduling and appointment creation, keyboard focus visibility, and
accessible labels — applies to the **product as a whole**, and is satisfied incrementally as the
features it names are delivered. Each feature MUST state which checklist items it discharges. It
MUST NOT be treated as a gate on slices that do not yet contain the named features, and it MUST NOT
be quietly dropped.

**Rationale**: The prototype has no lint, test, typecheck, or lockfile. Establishing the gate before
the code exists is the only time it is free. Adding a database and an API adds failure modes — a
migration that cannot roll forward, a contract that drifts from its consumer — that only automation
catches reliably.

### VIII. Attendee Data Is Personal Data

MyNet stores attendee profiles, private conversations, personal notes, and meeting appointments.
This is personal data about identifiable people, and it MUST be treated as such from the first
migration.

- **Identity is required for isolation.** Every stored record that belongs to an attendee MUST be
  attributable to exactly one identity, and every read path MUST be scoped by that identity. There
  is no development shortcut in which "one known user" stands in — that shortcut becomes the
  retrofit that leaks data.
- **Authorization is enforced server-side.** Client-side filtering is a presentation concern and
  MUST NOT be relied upon for access control. An endpoint MUST reject data it would not be
  permitted to return, independently of what the client requested.
- **Secrets never reach the client.** Database credentials, signing keys, and provider tokens MUST
  live only in server-side configuration and MUST NOT appear in the client bundle, the repository,
  or preview deployments.
- **Collect only what a requirement names.** Fields not traceable to an authoritative source MUST
  NOT be stored merely because they might be useful.
- **Private content stays private.** Messages, notes, and appointments are visible only to their
  participants. Any exception requires a recorded client decision. **Three such exceptions are
  recorded.**
  - *First* (2.3.0, D10): an attendee's profile is visible to attendees registered for the same
    event, enforced server-side by the event-scoping predicate, and the attendee MUST be able to
    withdraw from that visibility without deleting their account.
  - *Second* (3.3.0, Q1): an **audience question is visible to every attendee registered for the
    event it was asked at, under the asker's real name, and there is no opt-out** — including for
    an attendee who has turned discoverability off, because discoverability governs being *found*
    in the directory, not being *seen* having spoken in a room. Enforced server-side by the same
    event-scoping predicate as the first. **The two exceptions are not the same shape and the
    difference is the point**: the first is withdrawable and the second is not, so an attendee who
    wants to say nothing publicly must not ask, rather than ask and then retreat. What bounds it is
    stated with it under "Audience questions" — the attendee is told before they publish, the name
    is not a route into the profile, and the question is reportable.
  - *Third* (4.1.0, A8): **a reported message and the reporter's stated reason are visible to a
    platform operator in the administrative report queue.** Four conditions scope it, and all four
    bind:
    - **Only the platform tier.** A conference organizer MUST NOT read reports at all. A report
      names two attendees who may share no conference with that organizer.
    - **Only what was reported.** The specific messages the reporter identified, never the
      surrounding thread, never the pair's other conversations, and never a second report's subject.
    - **Only in the queue.** This grants no general read of message content anywhere else in either
      product.
    - **The reporter is told nothing.** FR-548's absence of a reporter-facing surface is untouched;
      a queue existing MUST NOT become a status anybody can poll.

    **The reported content will frequently be absent, and that is a designed state rather than a
    fault.** `abuse_reports` stores reported message identifiers as a plain array, deliberately not
    a foreign key, because "the reported messages will frequently be gone before anyone looks at the
    report" — by the reported attendee's deletion cascade or the reporter's own departure. A real
    foreign key left only bad options: `RESTRICT` blocks a deletion the erasure right requires, and
    `CASCADE` silently empties the report while leaving the row, which reads as "they reported
    nothing". The queue MUST therefore render *content unavailable* as a first-class state and MUST
    NOT present it as an error or as an empty report.

    *Why this one was granted where 4.0.0 withheld it*: the alternative to a scoped surface is not
    an operator who sees nothing. It is an operator who queries the database directly — unbounded,
    unscoped, and unaudited — which this document already concedes they can do. The exception buys a
    narrower disclosure than the status quo it replaces.

  An exception MUST be recorded here rather than **derived** from a rule elsewhere in this document,
  and **both the second and the third were derivable and were not derived.** The second could have
  been reasoned from attribution, already binding (3.2.0, N3), plus the plain fact that a question on
  a shared session is visibly public; the owner ruled on 2026-08-10 that derivation is not recording.
  The third could have been reasoned from an operator's evident need to judge what they are asked to
  act on; it was ruled on 2026-08-11 instead. **A privacy exception nobody had to accept is one
  nobody has accepted.**

  **4.0.0 granted no third exception and predicted this one** (A5): *"A report surface that showed
  the reported message text WOULD be a third exception, and it is register entry 24 rather than a
  consequence of A5."* **4.1.0 answers that entry, and the prediction is the point** — the exception
  was recorded by amendment rather than reasoned into existence inside a feature specification,
  which is what Principle VIII requires and what 3.3.0 ruled when the same shortcut was available for
  Q&A. What 4.0.0's restraint still binds: administration reads attendee data by definition, and the
  arrival of a second actor is **not** a standing licence over everything. Three exceptions are
  recorded; a fourth needs a fourth amendment.

  **Operator records are personal data about somebody who may not be an attendee**, which is a case
  this principle has never had to consider: "every stored record that belongs to an attendee MUST be
  attributable to exactly one identity" is written around a table that a platform operator has no row
  in. The deletion, export and retention obligations below therefore need an explicit answer for the
  new tables rather than an inherited one — see "Administration, and the second actor".
- **Deletion and export are standing commitments**, not features to be invented later. *Stated as
  recognised obligations in 2.0.0 and made concrete in 2.3.0 by D6.* Three rules bind every feature
  that stores attendee data:
  - **Deletion is self-serve, hard, and cascading.** An attendee MUST be able to delete their own
    account without an intermediary, and doing so MUST remove every record attributable to them. No
    soft delete and no tombstone row — a record marked deleted is a record still held. Any feature
    storing attendee data MUST make its records reachable by that cascade in the same change that
    introduces them.
  - **Export is self-serve and machine-readable**, and MUST cover every table holding data about the
    requesting attendee. A field that is collected but not exported is a defect.
  - **Personal-data records no cascade can reach MUST expire on a clock.** Some records are
    deliberately not attributable to an attendee row — `sign_in_attempts` holds keyed hashes with no
    foreign key, so that attempts against addresses belonging to nobody are still recorded. Such
    records are pseudonymous rather than anonymous, and a stated retention window is the only thing
    that can clear them.

  These are built to the strict standard deliberately, so that settling which data-protection regime
  applies is not a precondition for shipping. An absence in a given slice MUST still be recorded in
  the Open Questions Register rather than passed over.

**Rationale**: Version 1.x had no such principle because it stored nothing. The decision to persist
real attendee data created a privacy surface in one step, and the failure modes there are not
recoverable by a later patch — leaked data stays leaked.

### IX. Every Feature Declares Its Own Completeness

The obligations in Principles IV, VI, VII, and VIII apply to every feature. They are stated in four
different places, which is how they get missed. Each feature specification MUST therefore carry an
explicit, reviewable declaration covering all of the following:

- **Offline behaviour** — what works offline, what does not, and what happens to an action attempted
  offline (Principle VI).
- **Layout** — how the feature renders at desktop, tablet, and mobile widths (Principle IV).
- **Empty, loading, and failure states** — for every surface that crosses the network (Principle IV).
- **Accessibility** — accessible labels, visible focus, keyboard operability, and Escape-key
  dismissal where the feature introduces a modal (Principle IV).
- **Validation checklist items discharged** — which of the requirements checklist this feature
  satisfies, and which it deliberately leaves to a later feature (Principle VII).
- **Identity scoping and server-side authorization** — mandatory for any feature that stores or
  reads attendee data (Principle VIII).
- **Deletion and export coverage** — mandatory for any feature that stores attendee data. How each
  new record is reached by the deletion cascade, and how it appears in the export; and for any record
  no cascade can reach, the retention window that clears it (Principle VIII, added 2.3.0). A field
  that is collected but does not appear in both answers is a defect, not an omission to fix later.
- **Register position** — which Open Questions Register entries block this feature, and which it
  resolves.

**An obligation that is not declared is presumed unmet.** An explicit "not applicable, because…" is
a valid declaration; silence is not. A specification missing this declaration MUST NOT pass its
review gate, and a feature MUST NOT be marked complete while any declared obligation is outstanding.

These obligations MUST NOT be deferred to a consolidated later pass. A feature that postpones its
accessibility, responsive, or offline work to a future "polish" or "hardening" activity has not
discharged it. Such an activity is legitimate only as verification of work already done.

**Rationale**: The prototype failed Principle IV in exactly the way this prevents — Escape handling
and focus states were requirements from the beginning, were never anyone's stated responsibility in
any particular screen, and so were built by nobody. Scattering an obligation across four principles
makes it everyone's job in the abstract and no one's in the concrete. A per-feature declaration makes
the omission visible at spec review, which is the cheapest moment it can be caught, and it removes
the failure mode where a hardening phase becomes a rubber stamp for work that was never done.

## Technology and Architecture Constraints

- **Client stack**: React + TypeScript, built as an installable PWA. Type checking MUST be enabled
  and enforced (the prototype has no `tsconfig.json`; production MUST).
- **Backend and API**: MyNet has a project-owned API service over a **PostgreSQL** database. The API
  contract is owned by this project — not generated by a vendor and not dictated by a third-party
  platform. This was decided by the owner on 2026-08-04 in preference to a managed
  backend-as-a-service, for portability and contract control; the operational cost of that choice is
  accepted.

  **The database need not be a managed service** (amended 3.0.0, decision D12). Until 3.0.0 this
  clause read "a managed **PostgreSQL** database"; PostgreSQL now runs as a container in the
  application's own stack, reachable only from its host. **What is unchanged is most of what the
  original clause was protecting**: the engine is still PostgreSQL, the API contract is still owned
  by this project, schema changes are still versioned reviewed migrations verified in CI before
  reaching real data, and data access still goes through repository interfaces. Only *who provisions
  and operates the database* changes — and with it, the obligation below.
- **Schema changes** MUST be expressed as versioned, reviewed migrations committed to the
  repository. Ad-hoc changes to a live database are prohibited. Every migration MUST be verified in
  CI before it reaches an environment that holds real data.
- **Data access**: feature code reaches data only through repository interfaces (see Principle V).
  Transport, serialization, and caching details MUST NOT leak into components.
- **Authentication**: real authentication is in scope. Sessions MUST be established and validated
  server-side. Whether identity is self-owned or delegated to a provider is an open question, not a
  default.
- **Dependencies**: The production dependency set MUST be derived from actual need. The prototype's
  inherited Figma Make dependency list (MUI, recharts, react-dnd, react-slick, embla, react-router,
  and the unused shadcn/ui scaffold) carries no authority and MUST NOT be copied forward wholesale.
  A lockfile MUST be committed.
- **Design tokens**: Colors, typography, spacing, and radii MUST be defined as named tokens in one
  place. Hardcoded hex literals scattered through components are prohibited. The approved palette —
  deep navy surfaces, warm coral accents, soft cream backgrounds, white content cards, subtle mint
  status cues — MUST be expressed through those tokens.
- **Icons**: A single consistent icon set MUST be used. Hand-inlined one-off SVG is prohibited
  except for genuinely bespoke marks.
- **Product boundaries**: organizer administration and payment processing remain out of scope
  (Principle III). **Engagement** notification delivery and calendar integration remain out of scope
  until a recorded decision brings them in; the interfaces for them exist (Principle V) but MUST NOT
  be wired to real delivery without that decision. The prototype's notification bell MUST NOT be
  reproduced.

  *Narrowed in 2.3.0 by D8.* **Transactional account mail is in scope** — email address verification
  and password reset, and nothing else. The exclusion above was written to keep an engagement surface
  out of the product; it was never about the messages that make an account usable, and reading it
  that way would have made self sign-up impossible to deliver safely. The boundary is: mail the
  attendee's own account lifecycle requires is in; mail that tells them something happened in the
  product is out.
- **State**: server state and client state MUST be distinguishable. Server-derived data MUST NOT be
  duplicated into ad-hoc client state where the copy can silently diverge from its source.
- **Persistence**: attendee data is durable and server-side. `SecureStorage` covers client-side
  secrets and MUST NOT be used as a general cache. What may be cached on the client, and for how
  long, MUST be specified per feature rather than assumed.

### Deployment environments

Added in 3.0.0 by decision D12/D13. This block is what replaces the per-change preview deployment
Principle VII no longer requires.

- **Two environments, isolated by construction**: `uat` and `prod`. Each MUST have its own host, its
  own database, its own secrets, and its own address. A deployment, a runaway query, or resource
  exhaustion in one MUST NOT be able to affect the other.
- **UAT MUST NOT be connected to any data store holding real attendee data.** This is 001's FR-067,
  unchanged in substance and unchanged in force — the environment it binds has changed, the rule has
  not. **Separate configuration is not sufficient**: the separation MUST be enforced, and a
  deployment tool that can be pointed at the wrong database MUST refuse rather than proceed.
- **The client and the API MUST be served from one origin.** This is not an implementation
  preference: it is what keeps the session cookie's `SameSite` attribute a genuine CSRF defence
  rather than a nominal one, and it is why no synchroniser-token scheme is required. A topology that
  splits them MUST NOT ship without one.

  **The administrative site is a SUBDOMAIN of the same registrable domain** (*added 4.1.0 by A7*),
  with `/api/*` reverse-proxied under it so its own calls remain same-origin. The rule above is
  therefore satisfied twice rather than bent once: each product is served from one origin, and
  neither reaches the other's.

  The distinction this rests on MUST NOT be re-derived carelessly, because getting it backwards in
  either direction is expensive. **`SameSite` is evaluated against the registrable domain, not the
  origin.** A subdomain is therefore **same-site** — so `SameSite=Lax` survives entirely intact and
  no synchroniser token is needed — while being **different-origin**, which is what gives the
  administrative app its own service-worker scope, its own storage, and its own Content-Security-
  Policy. No other topology provides both. A path on the attendee origin shares the origin, and the
  attendee service worker is registered at **root scope**, so it would intercept administrative
  navigations. A separate registrable domain stops `SameSite=Lax` being sent at all, which is
  precisely the 3.0.0 failure: `fly.dev` and `pages.dev` are separate registrable domains on the
  Public Suffix List, the cookie was never sent, and **the configuration could not sign anyone in.**

  **The administrative session cookie MUST be host-only** — no `Domain` attribute — so it is never
  sent to the attendee host and the attendee session is never sent to the administrative one. One
  person signed into both holds **two independent sessions**: an elevated session does not ride
  along with casual attendee browsing, and signing out of one does not sign out of the other.
- **Every deployed environment MUST serve over TLS** with a publicly trusted certificate obtained
  and renewed without manual intervention.
- **The database MUST NOT be reachable from outside its own host.**
- **Backups are a governance obligation, not an operational nicety.** Now that the project
  provisions its own database, no vendor provides point-in-time recovery. Production MUST be backed
  up at least daily on an automated schedule; the schedule, the retention period, and the restore
  procedure MUST be written down; and **the restore MUST have been performed successfully at least
  once before production holds real attendee data.** A documented restore that has never been run is
  a hope, not a procedure.
- **A rollback procedure MUST exist and MUST state what happens when the schema has moved ahead of
  the application.** A rollback path that assumes the database can always follow the code backwards
  is the one that fails when it is needed.

### Data scoping, content provenance, and composition

Decided by the project owner on 2026-08-06. Binding on every subsequent feature.

- **Event scoping is hybrid.** Conference **content** is per-event and swaps when the attendee
  switches events: sessions, tracks, speakers, rooms, the Discover directory, and appointments.
  **Relationships** persist across every event: contacts, exchanged digital cards, and message
  threads. Every new table MUST state which of the two rules applies to it and why; neither rule is
  a default that may be assumed. The scoping predicate is enforced server-side, as part of the same
  identity binding required by Principle VIII — an attendee MUST NOT be able to read another
  event's content by manipulating a request.

  *Rationale*: MyNet is a professional networking product. A contact made at last year's conference
  must not vanish because the attendee is now at a different one. But discovering people means
  discovering people who are present, and an appointment is a time and a place at a specific event.

- **Conference content is seeded; profiles are attendee-authored.** Events, sessions, tracks, rooms,
  and speakers ship as committed, versioned seed data. Each attendee authors their own profile —
  company, role, interests, networking intent, availability — and MUST NOT be able to edit anyone
  else's. Networking intent and availability are decisions a person makes, not facts an organizer
  records.

  *Amended 4.0.0 by A4.* This clause previously read: "Seed data MUST NOT become a route around the
  organizer-administration exclusion in Principle III. No administrative interface, no privileged
  role, and no content import path may be built without an amendment. Adding a conference is a
  reviewed change to committed seed data." **That amendment is this one.** What replaces it:

  - **Conference content MAY be authored by a conference organizer** in the administrative product,
    within the conferences they are assigned. This is the content-import path the old clause
    forbade, and it is now permitted only through the second actor and only there.
  - **A reviewed change to committed seed data remains a valid route** and is not deprecated. It
    stops being the *only* route.
  - **There is ONE CLASS OF CONFERENCE.** A seeded conference is an ordinary editable conference. No
    privileged content, no immutable content, and no control that renders for a conference it cannot
    act on. Two classes would put two rules in one table and give an organizer affordances that
    silently do nothing.
  - **The seed remains the development and test fixture**, and its fixture properties are load-
    bearing rather than incidental: `assertDisjoint`'s two-fully-disjoint-programmes guarantee, and
    the deliberately empty third conference that exists so the "no programme" state cannot rot. A
    feature that makes authoring the real path MUST NOT take these with it.
  - **A profile is still not conference content.** Each attendee authors their own, and **no
    administrative tier may edit anybody's profile** — the sentence above is unchanged and is now
    load-bearing in a way it was not when no organizer existed. Networking intent and availability
    remain decisions a person makes, not facts an organizer records.

- **Home is composed, not aggregated.** Home is a registry of independent cards. Each card owns its
  own loading, empty, and failure states, and a card that fails MUST NOT blank the dashboard or
  prevent any other card from rendering. No card may depend on another card's presence, ordering, or
  data. A feature contributing to Home does so by adding a card and registering it, never by editing
  another feature's card.

  *Rationale*: Home is the first viewport, and Principle III makes the first viewport a success
  criterion. It is also the one surface every feature wants to touch. Composition keeps it improving
  continuously without becoming a shared file that every change contends for.

### Attendee identity, personal data, and profile

Decided on 2026-08-07 and recorded in `brainstorm/04-attendee-identity-and-profile.md`. Binding on
every subsequent feature. These close the last three register entries that blocked phase 004.

- **A person becomes an attendee by signing themselves up.** Account creation is self-serve — email,
  display name, and a password — and registration for a conference happens by entering an access code
  carried on the seeded event row. Email is unique product-wide, not per event, which is what makes
  one account work across every conference.

  This does **not** breach the organizer-administration exclusion, and the reasoning MUST NOT be
  re-litigated by inference. The register offered four candidate models; Principle III and the
  seed-data clause above had already eliminated three of them. *Event invitation* and
  *organizer-provisioned* both require an issuer who is not an actor in this system, and *ticket
  holder* requires an external integration nobody has decided on. Self sign-up is the only model
  under which the attendee remains the sole actor. A join code on a seeded row is seed data, not an
  administrative interface, not a privileged role, and not a content import path.

  *Consequence*: a password recovery flow is now in scope. `attendee_credentials` deliberately holds
  no recovery material, on the strength of this question being open; it is open no longer.

  *Annotated 4.0.0, and DELIBERATELY NOT REWRITTEN.* The premise above — "self sign-up is the only
  model under which the attendee remains the sole actor" — was true when it was reasoned and is now
  historical, because A2 creates a second actor. **D5 is unchanged and MUST NOT be reopened**: how a
  person becomes an *attendee* is untouched by this amendment, and the three rejected models are
  still rejected for reasons that never depended on the sole-actor premise (two need an issuer this
  product still does not have, one needs an undecided integration). The paragraph is preserved as
  written because the reasoning is the artifact, and because 4.0.0's own A2 leans on it directly:
  **self sign-up is unavailable for administrators for the mirror-image reason it was mandatory for
  attendees.**

- **Retention, deletion, and export are self-serve and complete**, per Principle VIII as expanded in
  2.3.0. This supersedes the narrow commitment phase 005 shipped under — notes and saves deleted with
  the account, no export path — which was a correct declared limit at the time and is now discharged
  rather than merely restated.

- **Attendee avatars are uploaded, not seeded or generated.** Resizing and **EXIF stripping are
  mandatory, not optional**: photographs taken on a phone carry GPS coordinates, so storing one
  unstripped publishes where it was taken. An avatar is attendee personal data and MUST be covered by
  both the deletion cascade and the export file.

  Recorded with this: the Unsplash photographs in the prototype are pictures of **real people** used
  as sample data. They MUST NOT ship as seeded attendee faces — the repository is public, and doing
  so would attribute real likenesses to fictional attendees.

- **Image bytes go through `StorageService`** (Principle V), never through a storage SDK called from
  feature code. The production provider is deferred into register entry 11 alongside API hosting and
  the database provider, so no feature is blocked on provisioning it.

- **A profile is visible to attendees registered for the same event**, enforced server-side by the
  existing event-scoping predicate rather than by client-side filtering, and every attendee has a
  single discoverability toggle that removes them from Discover. Visibility is all-or-nothing by
  design; per-field permissions were considered and rejected as disproportionate.

  *Rationale*: this is the exception Principle VIII requires to be recorded rather than assumed. A
  networking product in which nobody can see anybody does not work, but "you registered, so you are
  discoverable, permanently" is not a defensible position next to a self-serve deletion commitment.

  **SHARPENED 3.2.0, after a feature tried to work around it.** There is **one visibility decision
  per attendee**, and it is the discoverability toggle. **No feature may give an individual field
  its own audience** — not a field shown only to some readers, not a field carried only by some
  artifact, not a field disclosed only by some action. Phase 008 specified an attendee-authored
  contact line carried **only** by a shared card and never by the directory, on the reading that
  this clause governs the profile *in the directory* while a card is a second surface. **That
  reading is rejected and the field was withdrawn.** A per-field audience is a per-field permission
  however it is reached, and "all-or-nothing" means what it says.

### Networking relationships and appointments

*Added 3.2.0 by owner decisions taken 2026-08-10 and recorded in
`brainstorm/07-network-and-appointments.md`. This block is where register entries 7 and 8 now live:
both are struck through, and a struck-through entry is not where anybody looks for a rule.*

- **A contact is someone whose digital business card you hold.** There is no connect verb and no
  accept step, because neither appears in `GroundZero/requirements.md` or the prototype. Holding a
  card is the whole relationship, which is why entries 7 and 8 close together rather than
  separately.

  **Contacts MUST NOT be derived from conversations.** Phase 007 made a conversation a *unilateral*
  act — open send, no request, no acceptance — so deriving contacts from threads would let a
  stranger insert themselves into another attendee's Network by sending one message. This half was
  settled by 007 as a consequence of open send, before entry 7 itself was answered.

- **Sharing a card is one-directional.** It gives the recipient the sharer's card and gives the
  sharer nothing; you hold theirs when they share back. **Nothing about a person may become durable
  without that person's own act** — the property worth protecting in a product with public self
  sign-up and no moderator by construction.

- **The stored record is the exchange, not the person**: sharer, recipient, the instant, and the
  event it happened at. A held card MUST resolve the sharer's **current** profile at read time. A
  snapshot is forbidden: it duplicates personal data, outlives the subject's own edits, and creates
  a second source for one person.

- **A shared card is standing consent that outlives both the event and the discoverability toggle.**
  Resolution MUST therefore bypass the directory's discoverability condition, and MUST NOT require
  the two attendees to share a current event. **Discoverability governs being *found*, not being
  *remembered*.**

  Resolution MUST NOT consult verification state. Verification gates discoverability and nothing
  else, and re-checking it here would be a second use of it — which Principle VIII's shipped
  invariant forbids.

  *Rationale*: Discover is per-event **and deliberately uncached**, so before this nothing durable
  survived a conference at all — while D1's own rationale already promised that "a contact made at
  last year's conference must not vanish". Network is the durable half of a product whose discovery
  surface is transient by design, and this clause is what makes the older promise true.

- **A card cannot be recalled.** Blocking is the control: a block MUST sever card resolution in both
  directions and MUST also prevent scheduling. Following 007, a block suspends and is reversible; it
  destroys nothing.

- **An appointment is proposed, then accepted or declined.** This takes an acceptance step that 007
  refused for conversations and that this amendment refuses for cards, and **the asymmetry is
  deliberate rather than drift**: a message and a card impose nothing on the other person, whereas
  an appointment claims a slot of their time, and reserving another person's time is a different
  act.

- **Meeting-slot availability MUST disclose nothing about the invitee.** Deriving offered slots from
  the invitee's saved sessions, appointments, or any other private state is **forbidden**, as is
  auto-declining on their conflicts. Both leak a private schedule *by omission* — greying out
  somebody's committed slots tells the reader where that person will be all day. Availability MUST
  be a function of the reader's own commitments alone.

  *Rationale*: this is a Principle VIII violation that looks like a feature, which is why it is
  written down. The delivery roadmap proposed the forbidden variant by name, and a calendar product
  would do exactly it.

- **No appointment raises a notification.** Not a proposal, not an acceptance, not a decline, not a
  cancellation. The trigger set stays at **a received message and nothing else**, per "Notification
  delivery" below, and a feature wanting a second trigger MUST amend that block.

### Audience questions

*Added 3.2.0 by an owner decision taken 2026-08-10. This block is where register entry 9 now lives.*
*Extended 3.3.0 by Q1, taken the same day at 009's spec review, with the visibility exception that
attribution turned out to carry and the three consequences that bound it.*

- **An audience question is attributed to its author.** Anonymous questions were the alternative and
  were not chosen. A question therefore carries the asking attendee's identity, and so does a vote.

- **A question is public to the event, under a real name, with no opt-out.** This is the second
  recorded exception to Principle VIII's "private content stays private", and it is recorded there
  as well as here. Every attendee registered for the event sees every question asked at it, with
  the asker's display name attached, **including questions asked by an attendee who has turned
  discoverability off**. Three consequences bind alongside it, and an implementation that carries
  the exception without them has not implemented this rule:
  - **Attribution MUST NOT consult verification state.** Verification gates exactly one thing —
    discoverability — and this constitution has held since 2.3.0 that no feature may use it for
    anything else. A question is not a profile, and re-checking verification here would be a second
    use of it.
  - **The author's name MUST NOT be a route into their profile.** The name attributes the question;
    it does not open the person. Q&A publishes that somebody spoke, not who they are — and a name
    that navigates would hand the directory's own visibility decision to whoever reads a session.
  - **The attendee MUST be told what will be published, before they publish it.** An exception with
    no opt-out is only defensible if nobody meets it by surprise. The warning is part of asking, not
    a setting somebody could have read beforehand.

  *Rationale*: the exception is what the attribution decision actually cost, and it was nearly not
  written down — attribution entails it, and entailment is exactly how an unaccepted privacy
  exception ships. The three consequences are here rather than only in a feature specification
  because a specification governs one phase and this governs every phase after it.

- **Reporting from a question is what makes the absence of a moderator survivable.** Q&A is the
  product's **first many-to-many surface**: until now, anything one attendee wrote reached one other
  attendee (007) or nobody (notes). A question reaches the whole room, and organizer administration
  is excluded by construction, so there is **no moderator and there will not be one**. A question
  MUST therefore be reportable from the question itself, on the disposal path 3.1.0 made binding —
  the report leaves the product as operator mail, blocks in the same action, and is readable from
  nowhere inside the product. Blocking MUST make the two attendees invisible to each other in Q&A,
  in both directions. **A public surface with no moderator and no report control MUST NOT ship.**

- **Q&A is consequently a personal-data surface under Principle VIII**, and this is the operative
  consequence rather than a note. Questions and votes MUST carry identity scoping enforced
  server-side, MUST be reached by the deletion cascade, and MUST appear in the export — exactly like
  any other attendee data. The feature that introduces them declares each, and the two coverage
  tests fail its build until it does.

  *Rationale*: entry 9 was phrased as deciding *whether* Q&A is a personal-data surface. It is now
  decided that it is, so the phase building it inherits the full weight of Principle VIII rather
  than a lighter regime for "just content".

- **Deletion is harder here than the register anticipated, and 3.2.0 did not solve it.** A departing
  attendee's question may sit on a session other attendees have upvoted. 007 settled the analogous
  problem for conversations — the departing party's words vanish, the survivor keeps their own — but
  the three options do not resolve the same way for a question with other people's votes attached to
  it. **The phase that builds Q&A MUST decide and declare this**; it is not licensed to assume 007's
  answer transfers.

  **DECIDED in 3.3.0 by phase 009, which is the phase that was told to decide it.** A departing
  attendee's question is **removed**, and **other people's votes on it are removed with it** — the
  question cascades from `attendees` on its author reference, and a vote cascades from **both** the
  voter and the question. There is **no one-sided survivor here, and that is where this parts
  company with 007**: a conversation holds the survivor's own words, so something of theirs remains
  to preserve; a vote holds nothing but agreement with a question that is gone. An orphaned count on
  a vanished question would be a record of what somebody said, kept after they left, which is the
  one thing Principle VIII's deletion rule exists to forbid. The obligation above is **discharged**,
  and it is left standing rather than struck so the next reader sees what was asked as well as what
  was answered.

### Notification delivery

*Added 3.1.0 by M4, M5 and M7. This block is where register entry 10's surviving half now lives:
the entry is struck through, and a struck-through entry is not where anybody looks for a rule.*

**Engagement notification delivery is in product scope, for a received message and nothing else.**
Until 3.1.0 it was excluded outright. What changed is one thing only, and the boundary is narrow by
construction rather than by convention.

- **A received message is the ONLY trigger.** No notification may be raised for anything else — not
  a saved session starting, not an appointment, not an audience question, not an announcement.
  A feature that wants a second trigger MUST amend this block. Enforced by test, not by convention:
  a trigger set that can only be widened deliberately is the difference between a bounded capability
  and a channel every later feature helps itself to.

- **The notification bell MUST NOT be reproduced, and neither MUST an in-app notification centre.**
  This is entry 10's original prohibition, carried forward **unchanged and unweakened**. Delivery
  and an inbox are separable, and bringing the first in does not bring the second. The prototype
  header's bell with its unread dot remains forbidden.

- **Delivery MUST go through `NotificationService`** (Principle V), over a domain shape rather than
  the browser's own `PushSubscription` type. A push provider is an external dependency and a secret;
  neither may appear in feature code, and the server-side port MUST be vendor-free.

- **Permission is deniable, so notification delivery MUST NOT be the only path to freshness.** Every
  capability except delivery itself MUST work identically for an attendee who refuses permission,
  and refusing MUST NOT degrade any other surface. An attendee who says no gets a complete product.

- **Notification content is personal data on a lock screen, and that consequence is ACCEPTED rather
  than solved.** M7 puts message text in the payload, on the reasoning that a notification saying
  only "you have a message" makes the attendee open the application to learn whether it mattered —
  which is most of the value gone. The cost is real: message content becomes visible on a locked
  device to whoever is holding it. **Whether an attendee may suppress content in notifications was
  not decided**, and it is recorded here as outstanding rather than closed. Principle VIII's
  collect-only-what-a-requirement-names rule is unaffected: nothing new is stored.

- **Subscriptions are per device, not per session.** Signing out MUST NOT revoke one; revoking
  permission and a permanent delivery failure MUST. A subscription record holds credentials rather
  than content, and MUST NOT be reproduced in the personal-data export — the presence of a device
  and its timestamps are a record, the keys are a capability.

*Rationale*: a networking product's value is a timely reply, and a message discovered an hour after
a session ended is worth very little. That is the whole of what M4 buys, and it is why the reversal
is narrow: the exclusion existed to keep MyNet from becoming a product that interrupts people, and
one trigger tied to a message somebody actually sent does not make it one.

### Reporting conduct out of the product

*Added 3.1.0 by M8.*

*Narrowed 4.0.0 by A5 — narrowed, not lifted. The heading still says "out of the product" and that
is now true of the **attendee** product only.*

**A report MUST leave the attendee product as mail to a configured operator, and MUST NOT be
readable from inside MyNet.** No route, no repository method, no screen, no privileged role, in the
attendee product. FR-548 and `no-report-read-surface.test.ts` survive for MyNet unchanged, and the
reasoning that produced them is unchanged with it: a reporter is told nothing it cannot keep — no
case identifier, no status, nothing to poll.

**A platform operator MAY read reports in the administrative product.** The original clause rested
on an argument that no longer holds — "a report-reading surface needs a moderator, and a moderator is
an organizer — the actor Principle III excludes by construction" — and the excluded actor now exists.
Three conditions bind that surface:

- **Only the platform tier.** A conference organizer MUST NOT read reports. A report names two
  attendees who may share no conference with the organizer, and conduct reported at one event is not
  an assigned conference's business.
- **It discloses the reported content and the reporter's stated reason** (*decided 4.1.0 by A8,
  resolving register entry 24*), under the four conditions recorded with the **third** Principle VIII
  exception: platform tier only, only what was reported, only in the queue, and nothing back to the
  reporter. **The operator-mail rule below is unchanged** — mail still carries identifiers and a
  timestamp and nothing else, because the reason it was written that way was that an inbox lives
  outside every retention rule this project controls, and a queue reading the row does not.

  **The queue MUST render *content unavailable* as a first-class state.** Reported message
  identifiers are stored as a plain array rather than a foreign key precisely because the messages
  are often gone before anyone looks, so an empty content pane is the expected case and MUST NOT be
  presented as an error or as a report of nothing.
- **The reporter is still promised nothing.** A queue existing MUST NOT become a status the reporter
  can see. FR-548's absence of a reporter-facing surface is not what this amendment narrows.

- **Reporting MUST also block**, in the same action. Somebody reporting conduct wants it to stop
  now; a report that only files paperwork leaves them reachable by the person they just reported.
- **Operator mail MUST carry identifiers and a timestamp only** — never message text and never the
  reporter's reason. Both are two attendees' personal data, and an inbox is outside every retention
  rule this project controls, for a recipient who can query the database directly.
- **A failure to dispatch MUST NOT fail the report or the block.** Safety cannot depend on an
  external service succeeding, and an unprovisioned provider is the expected state (entry 18).
- **The operator address is undecided** — register entry 21. Until it exists, a report is still
  blocked and still recorded, and the skipped dispatch MUST be logged rather than silently dropped.
  *Changed 4.0.0*: the entry is no longer only about an address. A platform operator reading a queue
  can keep the promise the reporting dialog makes without any mail being sent at all — so what the
  entry now asks is **who that operator is**, which is still an obligation the owner personally
  holds. The mail path is not deleted: an operator who must open a site to learn a report exists is
  an operator who learns late.

### Brand identity and application icons

*Added 3.4.0 by B1–B5. This block is where register entry 2's answer now lives: the entry is struck
through, and a struck-through entry is not where anybody looks for a rule.*

**The project owner's brand board is the single source of every brand asset**, supplied 2026-08-10.
Until then no mark existed here, and none was invented — Principle I forbids answering a question
nobody asked, and a mark is exactly such a question.

- **One source, and derived assets rather than delivered ones.** Every icon, favicon and in-app mark
  MUST derive from the tracked brand source **by a readable script**, not be committed as an opaque
  binary of unknown provenance. A reviewer MUST be able to verify the crop geometry, the plate colour
  and the maskable safe-zone inset by **reading code**, and the script MUST fail loudly rather than
  emit a plausible asset from an unexpected source. This is the convention the provisional generator
  established and it is retained deliberately: it is what makes a later vector redraw a change of
  *input* to one pipeline rather than a second, divergent mechanism.

- **The brand constants are a reasoned exception to the single-colour-definition rule, and the only
  one.** FR-008 puts every colour in the token file and the manifest gets no exemption — the
  manifest's two values are *read from* the tokens at build time rather than written beside them.
  The brand's navy and coral are different in kind: they are **identity, not palette**, they are
  measured from the board rather than chosen, and they deliberately do **not** move when a token
  moves. The reason is mechanical rather than aesthetic and MUST be recorded where they are defined:
  the board carries no alpha channel, so the mark's antialiased edges are blends against its own
  navy, and any other plate colour leaves a visible halo around every curve.

- **Whether the design tokens adopt the brand's values is undecided** — register entry 22 — and
  until it is settled the icon plate and the token-derived `theme_color` differ visibly on the
  splash screen. That seam is **accepted knowingly**, not overlooked. No feature may resolve it by
  quietly repainting a token: the primary surface and the accent are involved, so it repaints the
  whole product and every contrast ratio must be re-verified.

- **The mark ships as an image beside live text. A raster lockup is forbidden.** The product name
  stays real text from the single branding constant (FR-049), so it remains selectable, searchable,
  translatable and legible to assistive technology at any size.

- **The mark is decorative and MUST NOT replace an accessible name.** Adding it to a surface MUST
  leave every existing heading, label and landmark exactly as it is — a mark is recognition, never
  the only way a surface identifies itself.

- **Colourway is chosen per surface, and getting it wrong is an absence rather than a degradation.**
  A dark-on-light mark placed on the inverse surface is invisible while remaining present in the
  DOM, correctly sized, and passing every behavioural assertion available. The board supplies two
  colourways precisely because this choice has to be made.

- **A declared icon with no file MUST fail the build.** Expectations MUST derive from the
  declarations themselves — the manifest and the document head — so that a **newly declared icon
  fails by existing** rather than waiting for someone to remember to extend a check. This is the
  technique Principle VIII's deletion and export coverage tests use, applied to the one class of
  asset whose failure is invisible to every other gate: a manifest may name a missing file while
  typecheck, lint, unit, component, contract, migration, integration, accessibility, end-to-end and
  the production build all pass, and the failure appears only when a real device tries to install.

- **Install weight has no gate, and MUST therefore be stated by hand.** The asset budget measures
  the initial shell JavaScript — the entry chunk and what it statically imports — so static files
  never enter it, while the service worker precaches every image it finds. Any feature adding
  install assets MUST record their weight in a durable place and MUST exclude from the precache set
  anything the *installed* application never shows.

*Rationale*: the placeholder this replaces was struck through with an amber band on the reasoning
that "a tasteful placeholder is the dangerous kind: it looks finished, so it ships and nobody
notices for a year." The same instinct governs here. A brand mark is the one deliverable in this
product whose defects are invisible to every automated gate this project has — wrong colourway,
wrong size, wrong position, illegible at 16px — and the discipline that replaces those gates is a
readable derivation and a human who looks.

### Administration, and the second actor

*Added 4.0.0 by A1–A6. This block is where the reversal of Principle III's administration exclusion
lives, and it is written as binding text rather than as a resolved register entry for the reason
3.1.0, 3.2.0 and 3.4.0 each gave: a struck-through entry is not where anybody looks for a rule.*

**Administration is a SEPARATE PRODUCT.** It is its own website, served against the same API and the
same database. MyNet MUST NOT gain an administrative surface, a privileged view, or rendering that
branches on who is looking. This is not a packaging preference — it is what keeps Principle III's
attendee-workspace framing true while its actor clause is redefined, and it MUST be enforced as an
absence in the attendee product rather than asserted in prose.

**There are exactly TWO administrative tiers, and neither is reachable by self sign-up.**

- **Platform operator.** Seeded as committed, reviewed data, because the tier has to exist before
  any conference does and there is no issuer to invite the first one. Authority is product-wide. It
  is the **only** tier that may promote an attendee, and the **only** tier that may read the report
  queue.
- **Conference organizer.** An attendee promoted by a platform operator. Authority reaches **only
  the conferences they are assigned**, and is otherwise that of an ordinary attendee.

  A conference organizer **is** an attendee, with a real profile, who continues to use MyNet as one.
  **Promotion MUST NOT alter their attendee experience** in any observable way — it grants capability
  in the administrative product and nothing in this one.

**No self sign-up into either tier** is the load-bearing rule, and it is the exact mirror of D5.
Self sign-up was chosen for attendees because it was the only model that left the attendee sole
actor; it is unavailable here because anyone who can sign themselves up as an administrator is not
an administrator. A tier reachable by self sign-up would be a privilege escalation with a form.

**What MyNet MUST NOT gain**, and each MUST be testable as an absence in the same way 007's and
009's absence guards are:

- No administrative route, screen, or navigation entry in the attendee client.
- No rendering that branches on administrative tier.
- No report-reading surface (FR-548 survives for the attendee product; see "Reporting conduct out of
  the product").
- **No administrative edit of any attendee profile, by either tier.** Conference content is
  authorable; a person is not.

**The administrative product inherits obligations rather than escaping them.** Being a second site
is not a second standard:

- **Principle IV** binds it. Accessible labels, visible focus, keyboard operability, Escape-key
  dismissal, and three layouts. Register entry 4 — desktop and tablet layouts have never been
  validated — is **escalated** by an entire product of new desktop design, not answered by it.
- **Principle VII** binds it. Every gate that runs for the attendee client MUST run for this one.
- **Principle VIII** binds it, and reaches further here than anywhere else: an administrative read is
  still a read of personal data, still scoped server-side, still refused rather than filtered in the
  client. **Authority MUST be a server-enforced predicate**, in the shape `EventScope`,
  `ConversationScope` and `CardScope` already establish — never a claim the client presents.
- **Principle IX** binds it, and its completeness declaration MUST additionally state **which actor
  and which tier** each surface serves. Every feature through 010 had one actor and never had to say
  so; from 011 silence about the actor is an undeclared obligation.
- **Deletion, export, and retention MUST be answered explicitly for every new table**, not inherited.
  A platform operator has no `attendees` row, so the cascade that covers every existing personal-data
  table does not reach one. Both coverage tests derive expectations from the schema, so a new table
  fails by existing — which is the mechanism working, and the answer must be written down rather than
  allow-listed.

**Three things 4.0.0 deliberately did NOT decide are now decided, by 4.1.0.** They were opened as
register entries 24, 25 and 26 rather than left as gaps, and each turned out to be governance rather
than a specification detail — which is the argument for opening entries you cannot yet answer.

- **Where administration is served, and whose session it uses** (A7, entry 26). A **subdomain** of
  the same registrable domain, `/api/*` reverse-proxied under it, and a **host-only** session cookie
  so an operator holds two independent sessions. Stated in full under "Deployment environments",
  because it is a topology rule and belongs where D11 lives.
- **What the report queue discloses** (A8, entry 24). The **reported content and the reporter's
  stated reason**, to platform operators only. This is the **third** recorded Principle VIII
  exception; its four scoping conditions and the *content unavailable* requirement are stated with
  the exception itself, under Principle VIII.
- **An organizer's assignments end with their access** (A9, entry 25). **Deletion is never
  conditional** — D6 holds absolutely, and no administrative role may make an attendee's erasure
  right depend on another person existing. Instead:
  - **Deleting an account revokes that person's organizer assignments in the same transaction.**
  - **Withdrawing from a conference revokes the organizer assignment for that conference**, in the
    same transaction, for the reason 008 established when withdrawal began cancelling live meetings:
    **authority MUST NOT outlive the access it depends on.** A withdrawn organizer fails
    `requireEventAccess` and can no longer see the conference as an attendee, so an assignment left
    standing is authority nobody can observe being exercised.
  - **A conference left with no organizer enters an explicit `unassigned` state**, and platform
    operators MUST have a surface that shows it. The conference and its content survive untouched —
    conference content is not attendee data and no cascade reaches it — so the failure mode being
    prevented is not data loss but **silence**: an orphaned conference that nobody is prompted to
    adopt. Reverting ownership implicitly to the platform tier was considered and rejected for
    exactly that reason; it produces a tidier invariant and hides the event.

**Register entries 19 and 21 remain ADDRESSED but NOT closed**, and 4.1.0 does not change that. A8
gives an operator what they need to *judge* a report; it does not decide **who that operator is**
(21) or **what standard an avatar is moderated against** (19). A feature MUST NOT read either as
closed — Principle I applies to this block exactly as it applies to everything else.

*Rationale*: this reversal was not sought for its own sake. The product accumulated three
obligations it had no actor to discharge — an unmoderated avatar (entry 19), a reporting dialog
promising a human reader (entry 21), and a public many-to-many Q&A surface with no moderator (009) —
and each was traced back in writing to this exclusion. An exclusion whose cost is a safety promise
the product cannot keep must be paid for or reversed. What makes reversing it affordable is A3: the
attendee product is left exactly as it was, so the thing Principle III protects is not what changes.

## Branching and Change Flow

`main` and `develop` are protected. **No commit and no push may be made directly to either
branch.** Every change — code, specification, documentation, configuration, migrations, and this
constitution — MUST reach them through a pull request.

- `main` holds released, production-ready state.
- `develop` is the integration branch and the **default base for pull requests**.
- Work happens on a short-lived branch created from `develop`, named `<type>/<short-description>`
  where type is one of `feat`, `fix`, `chore`, `docs`, `spec`, or `refactor`.
- Pull requests targeting `develop` MUST be merged with **squash**, keeping one commit per unit of
  work and a linear history. The source branch is deleted on merge.
- Promotion from `develop` to `main` is itself a pull request. Force-pushing to and deleting `main`
  or `develop` are prohibited.
- A pull request MUST NOT be merged while its required checks (Principle VII) are failing.

**Enforcement**: versioned hooks in `.githooks/` block direct commits and pushes. Each clone MUST
activate them once with `git config core.hooksPath .githooks` — `core.hooksPath` is local
configuration and cannot be committed. These hooks are a guardrail against mistakes, not a security
control: they are bypassable with `--no-verify`. Authoritative enforcement is server-side GitHub
branch protection, which is **unconfigured** on this repository — not unavailable. Verified
2026-08-07: `branches/main/protection` and `branches/develop/protection` both return **404, meaning
no rule is set**, and the `rulesets` endpoint returns an empty list. The repository is public and
organisation-owned (`Programa-Semilla/mynet-ps`), and branch protection is free on public
repositories, so **nothing external prevents closing this gap**. Applying the configuration recorded
in `.githooks/README.md` is a configuration task that MUST be completed. Until it is, the gap is a
known and *unnecessary* risk rather than an accepted one. **With real attendee data now in scope,
this gap is materially more serious than it was under 1.x.**

### Parallel work and shared artifacts

Features run mostly one at a time, in parallel only where they touch disjoint files. Where two do
run in parallel, the following apply.

- **Migration numbers are reserved, not discovered.** A feature claims its migration number when its
  specification is written, from the sequence recorded in the delivery roadmap. Two open pull
  requests MUST NOT introduce the same migration number, and a migration file MUST NOT be renamed to
  resolve a conflict — renaming a migration that another branch has already applied is how a
  database and its history diverge.
- **Generated artifacts are never hand-merged.** The published API contract and any other generated
  file MUST be resolved by taking one side wholesale and regenerating, never by editing the merged
  result. A hand-reconciled generated file is indistinguishable from a correct one until it is wrong
  in production.
- **Extension points are append-only registries.** Where more than one feature will contribute to
  the same surface — Home cards, API route registration, repository interfaces, seed data, card
  actions — the surface MUST be a registry that features append to, with each contribution in its
  own file. A feature MUST NOT be required to edit another feature's file in order to be included.
- **Each clone stands alone.** `core.hooksPath` is local configuration and MUST be activated in
  every clone, not only the first. Each clone used for integration testing MUST have its own
  database branch; two suites sharing one database overwrite each other's fixtures and produce
  failures that reproduce nowhere.

## Development Workflow and Quality Gates

- Work follows the Spec Kit flow: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`. Implementation MUST NOT begin before the spec and plan
  exist for that feature.
- Every plan MUST complete the **Constitution Check** gate before Phase 0 research and re-check it
  after Phase 1 design. Violations MUST be recorded in the plan's Complexity Tracking table with the
  simpler alternative and why it was rejected — never left implicit.
- Any ambiguity discovered mid-feature MUST be recorded in the Open Questions Register. Work that
  does not depend on the answer proceeds; work that does states its assumption explicitly or stops
  for a client decision.
- Accessibility and responsive verification are task categories in their own right, not finishing
  touches. A feature touching UI MUST produce tasks for both.
- **A feature that stores or reads attendee data MUST produce tasks for identity scoping,
  server-side authorization, and migration verification.** These are not implied by "make it work".
- **The Principle IX declaration is a spec review gate.** A specification without it is incomplete
  and MUST be returned rather than planned. Each declared obligation MUST be traceable to at least
  one task, and the feature MUST NOT be marked complete while any of them is outstanding.

## Governance

This constitution supersedes all other development practices, conventions, and habits for this
repository. Where a tool default, a template, or prior code conflicts with it, this document wins.

**Amendment procedure**: Amendments MUST be proposed as an explicit change to this file, carrying a
written rationale and, where the change invalidates existing work, a migration note. Amendments that
resolve an entry in the Open Questions Register MUST cite the decision that resolved it.

**Delivery decomposition**: `docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md` is
the authoritative decomposition of the product into features, and records their dependency order,
reserved migration numbers, and gate schedule. It is a plan, not governance: it does not bind
conduct, and it may be revised without an amendment. But a feature whose scope, dependencies, or
migration number departs from it MUST say so in its specification, because the roadmap is what the
next session reads to know what has been decided and what has not.

**Versioning policy** (semantic):

- **MAJOR** — a principle is removed or redefined in a backward-incompatible way, or governance
  itself changes.
- **MINOR** — a principle or section is added, or existing guidance is materially expanded.
- **PATCH** — clarification, wording, or typo fixes with no change in meaning.

**Compliance review**: Every plan verifies compliance at its Constitution Check gate. Every code
review verifies compliance against Principles III, IV, V, VII, VIII, and IX specifically, because
those are the ones a passing build can still violate. Unjustified complexity is a review blocker.

### Open Questions Register

Recorded discrepancies and undecided matters. Adding is always permitted; removing requires a
decision cited in an amendment.

**Resolved in 2.0.0**

- ~~Product name (EventLink vs. MyNet)~~ — **RESOLVED 2026-08-04 by owner decision: the product is
  MyNet.** Consequence: `GroundZero/requirements.md` and the prototype UI now carry a stale name.
- ~~Demo scope vs. the PWA persistence recommendation~~ — **RESOLVED 2026-08-04 by owner decision:
  MyNet is the real product with durable server-side persistence.**

**Resolved in 2.1.0**

- ~~Event scoping of data~~ — **RESOLVED 2026-08-06 by owner decision D1: hybrid.** Conference
  content is per-event; relationships persist across events. Recorded as a binding constraint under
  "Data scoping, content provenance, and composition".
- ~~Attendee profile view~~ — **RESOLVED 2026-08-06: a profile detail view is delivered**, closing
  the gap where `requirements.md` says a profile can be opened and the prototype has no such screen.
- ~~Repository shape~~ — **RESOLVED 2026-08-06: the API lives in this repository**, at `apps/api`
  inside the pnpm workspace, alongside the client.

**Resolved in 2.3.0**

All three entries that blocked phase 004, closed on 2026-08-07 by brainstorm #04. The project owner
confirmed he speaks for the client, so 5 and 6 are closed as client decisions.

- ~~5. Attendee identity model~~ — **RESOLVED by D5: self sign-up with an event join code**,
  delivered entirely within phase 004. Recorded as a binding constraint under "Attendee identity,
  personal data, and profile". Worth carrying forward: three of this entry's four candidates were
  never actually available, having been foreclosed by Principle III and the seed-data clause before
  the entry was written. The entry overstated the choice for its whole life, which is a caution about
  how the remaining entries are phrased rather than a criticism of this one.
- ~~6. Data retention, deletion, and export obligations~~ — **RESOLVED by D6: full self-serve.**
  Hard deletion with cascade and no tombstone, machine-readable export, and a retention clock for
  records no cascade can reach. Written into Principle VIII as three binding rules. Built to the
  strict standard deliberately, so that settling which regime applies is not a precondition. This
  supersedes phase 005's narrow declared commitment, and it gives 005's `ON DELETE CASCADE` something
  to trigger it — that cascade has been operationally unreachable since it shipped, because no
  delete-account route exists anywhere in `apps/api`.
- ~~13. Attendee avatar handling~~ — **RESOLVED by D7: real upload**, with resizing and EXIF
  stripping mandatory rather than optional.

**Resolved in 3.0.0**

Owner decisions taken on 2026-08-07 in brainstorm #05
(`brainstorm/05-discover-and-the-deployment-platform.md`).

- ~~11. API hosting, the managed PostgreSQL provider, and object storage~~ — **RESOLVED by D12: two
  isolated Azure VMs.** Each environment is one `Standard_B2s` running a Compose stack of Caddy
  (automatic TLS, and the reverse proxy that puts client and API on one origin), the API container,
  and a **loopback-only PostgreSQL container**. `StorageService` is backed by a volume on the same
  host. Fixed-cost, no vendor, isolation by construction. The trade is recorded rather than implied:
  a managed instance would have honoured the previous wording with no amendment, at additional cost
  per environment and a second thing to provision — it was rejected by owner decision, not by
  analysis. **The consequence is a new governance obligation**: backups, retention, and an
  *exercised* restore are now this project's responsibility, and are written into "Deployment
  environments".
- ~~17 (remainder). The preview path awaiting seven vendor secrets~~ — **RESOLVED by D13, by
  replacement.** The jobs are deleted rather than provisioned. See the annotation on entry 17 for
  why this is not a weakened gate, and Principle VII for what is given up.

**Withdrawn in 3.0.0, from a shipped feature**

- **001 FR-066 and SC-011** — the guarantee that a reviewer can open a preview of *that exact
  change*. Superseded by Principle VII as amended. This is the first time this project has retracted
  a delivered, verified requirement, and it is the reason this amendment is MAJOR rather than MINOR.
  **001 FR-067 is not withdrawn** and binds UAT unchanged.

**Resolved in 3.1.0**

- ~~Engagement notification delivery is out of product scope.~~ — **RESOLVED IN PART 2026-08-08 by
  owner decision M4**: delivery enters scope **for a received message and nothing else**. See
  "Notification delivery" under Technology and Architecture Constraints, which is now the binding
  statement; register entry 10 is struck through in place.

  Three things survive the reversal unchanged, and they are what keep it narrow:
  **the bell and the notification centre stay forbidden**; a received message is the *only* trigger,
  so a later feature wanting a second one must amend the constitution; and permission is deniable,
  so an attendee who refuses gets a complete product rather than a degraded one.

**Resolved in 3.2.0**

Owner decisions taken on 2026-08-10. Entries 7 and 8 come from brainstorm #07
(`brainstorm/07-network-and-appointments.md`); entry 9 was answered alongside them so that 008 and
009 — a free parallel pair — are unblocked by the same amendment.

**This is the first amendment to close the last entries blocking a queued phase.** With 7, 8 and 9
resolved, no register entry blocks any remaining feature. What remains open blocks *deployment* and
*release*, not code.

- ~~7. The connection model behind Network contacts~~ — **RESOLVED: a contact is someone whose card
  you hold.** Written into "Networking relationships and appointments". No connect verb and no
  accept step were invented, because neither appears in `requirements.md` or the prototype; and
  contacts MUST NOT be derived from conversations, which 007's open send had already made
  untenable.
- ~~8. What an exchanged digital card records, and whether the exchange is mutual~~ — **RESOLVED:
  one-directional, recording the exchange rather than the person.** Sharing gives the recipient the
  sharer's card and gives the sharer nothing. A held card resolves the sharer's live profile under a
  **standing consent that outlives the event and the discoverability toggle**, which is what makes
  Network the durable half of a product whose discovery surface is deliberately transient.
- ~~9. Audience-question attribution~~ — **RESOLVED: attributed.** Q&A is therefore a personal-data
  surface under Principle VIII, with identity scoping, deletion cascade and export coverage. The
  phase building it must still decide what happens to a departing attendee's question that other
  people have upvoted — 007's answer for conversations does not transfer, and that is stated in
  "Audience questions" rather than left to be discovered. **Decided 2026-08-10 by phase 009 and
  recorded in 3.3.0**: the question goes, and other people's votes on it go with it. There is no
  one-sided survivor, because a vote holds nothing of the voter's but agreement with something that
  no longer exists.

**Recorded in 3.3.0**

Owner decisions taken 2026-08-10 at phase 009's spec review and during its planning. **Neither
resolves a register entry** — one records a consequence a resolved entry carried, the other creates
an entry — which is why they sit here rather than above.

- **Q1. Public Q&A visibility is a recorded exception to Principle VIII, not a derived one.**
  Attribution was settled in 3.2.0 and *entails* that a question is seen, under a name, by the room
  — so the exception could have been treated as already made. The owner ruled that it could not:
  Principle VIII says an exception requires a *recorded* decision, both existing exceptions were
  recorded by amendment, and **an exception nobody had to accept is one nobody has accepted.** It is
  written into Principle VIII as the second recorded exception and into "Audience questions" with
  the three consequences that bound it. **It differs from the first exception in the way that
  matters**: profile visibility is withdrawable and this is not.
- **Q2. FR-756a is withdrawn from phase 009, and the gap it named becomes register entry 22.** The
  requirement asked a refused Q&A action to purge the conference cache. Meeting it would have given
  one feature a cross-feature responsibility no other undecorated repository has, by way of a new
  mechanism in a file every feature shares. **What was conceded is written down rather than lost**:
  a cached conference stays readable for up to 24 hours after the server begins refusing a withdrawn
  registration. That is product-wide, predates 009, and is not one feature's to fix alone.

**Sharpened in 3.2.0, without a decision being reversed**

- **Standing decision 16 — profile visibility is all-or-nothing** — gains an explicit prohibition on
  giving any individual field its own audience. Nothing is reversed: the clause meant this already.
  It is sharpened because phase 008 specified a contact line carried only by a shared card, on the
  reading that "all-or-nothing" governed the directory rather than the attendee. **The owner
  rejected that reading and the field was withdrawn** before any migration was written. Recorded
  because the *next* feature will meet the same temptation, and the specification that raised it did
  the right thing by refusing to resolve it silently.

  What it costs is recorded rather than glossed: M7 puts message content on a lock screen, and
  whether an attendee may suppress it **was not decided**. It is deferred, not closed.

  Consequence: the project acquires a second pending external dependency and secret — register
  entry 20, the push provider and VAPID key custody.

- ~~Feature code has no way to ask whether the attendee is looking at the page.~~ — **RESOLVED
  2026-08-08**: `VisibilityService` joins Principle V's device capabilities as a seventh.

  This is the first capability added by an *implementation* rather than by a product decision, and
  it reached this register because a test refused to let it in quietly:
  `packages/platform/tests/substitution.test.ts` asserted the list was exactly six and recorded that
  a seventh "without an amendment is a decision nobody recorded". It was right, and the guard is
  what turned a silent addition into this paragraph.

- ~~Reports have no stated disposal path.~~ — **RESOLVED 2026-08-08 by owner decision M8**: a report
  leaves the product as operator mail carrying identifiers and a timestamp only, blocks the reported
  attendee in the same action, and is readable from nowhere inside the product. See "Reporting
  conduct out of the product". **The address itself is NOT resolved** — register entry 21 — and the
  rule is binding without it: a report still blocks and still records, and the skipped dispatch is
  logged rather than silently dropped.

**Resolved in 3.4.0**

Owner decision taken on 2026-08-10, recorded in brainstorm #08
(`brainstorm/08-brand-mark-and-app-icons.md`) and in the four scope answers given while
`specs/010-brand-mark-and-app-icons` was written.

- ~~2. Real brand mark and application icons~~ — **RESOLVED: the owner supplied a brand board.**
  Written into "Brand identity and application icons". This entry needed no analysis and never had a
  candidate list — it needed an asset only the client could provide, which is why it outlived every
  entry opened after it and why nothing here could close it sooner.

  **What it cost to hold open honestly is worth recording.** The placeholder built under it is a
  navy square with a coral disc struck through by an amber diagonal band, and its README says why:
  *"a tasteful placeholder is the dangerous kind: it looks finished, so it ships and nobody notices
  for a year."* That instinct is the reusable part. An unanswered question is safest when the
  stand-in for it is impossible to mistake for an answer.

**Opened in 3.4.0**

- **23. Whether the design tokens adopt the brand's navy and coral.** Created by B4. See the entry
  below. Deliberately not answered by the amendment that created it: the two values involved are the
  primary surface and the accent, so adopting them repaints the product and re-opens every contrast
  ratio the accessibility gate checks.

**Escalated in 3.4.0, without being answered**

- **4. Desktop and tablet layouts have never been validated by the client.** Feature 010 puts a
  brand mark in the desktop rail and the tablet top bar, which is unreviewed design added to
  unreviewed design. Position, size and colourway are precisely the class of defect no behavioural
  gate can see — and 008 turned this entry from a risk into an observed one when the first human to
  look at a dialog found it rendering in the top-left corner, having passed 135 end-to-end tests,
  five review agents and CodeRabbit. **This amendment does not close it**, and feature 010 must not
  be read as having validated anything.

**Opened in 4.0.0**

Owner decisions taken on 2026-08-11, recorded in brainstorm #09
(`brainstorm/09-administrative-product.md`). All three are opened rather than answered, following
3.2.0's precedent of leaving a question explicitly open for the phase told to answer it.

- **24. What the administrative report queue may disclose.** Created by A5. See the entry below.
- **25. What happens when a promoted conference organizer deletes their own account.** Created by
  the collision between A2 and D6. See the entry below.
- **26. The administrative site's origin and session topology.** Created by A3, against D11. See the
  entry below.

**Addressed but NOT closed in 4.0.0**

Both have been open specifically because no administrative actor existed. 4.0.0 creates the actor;
it does not answer either question, and neither may be read as closed by feature 011 shipping.

- **19. Nobody moderates uploaded avatar images.** A capability is not a policy.
- **21. The operator address abuse reports are dispatched to.** The address question is half
  obsolete; the "somebody has to be that operator" question is not.

**Resolved in 4.1.0**

Owner decisions taken on 2026-08-11, in the session that ratified 4.0.0 and immediately after it.
**All three entries 4.0.0 opened are closed, and feature 011 is unblocked.**

- ~~24. What the administrative report queue may disclose~~ — **RESOLVED by A8**: the reported
  content and the reporter's stated reason, to platform operators only. Written into Principle VIII
  as its **third** recorded exception, with four scoping conditions. **4.0.0 predicted this would be
  an exception and refused to grant it by inference**, which is the point — the alternative was an
  operator's need-to-know reasoned into a privacy exception inside a feature specification.
- ~~25. What happens when a promoted conference organizer deletes their own account~~ — **RESOLVED
  by A9**: assignments revoked in the same transaction, deletion never conditional, conference
  visibly `unassigned`. Also answers the adjacent question the entry carried, about withdrawal.
- ~~26. The administrative site's origin and session topology~~ — **RESOLVED by A7**: a subdomain,
  same-site and different-origin, with host-only session cookies.

**Not closed by this amendment**, and this must not be read as tidying them away: entries **19** and
**21** remain ADDRESSED-not-closed. 4.1.0 tells an operator what they may see; it does not appoint
one or set the standard they judge by.

**Escalated in 4.0.0, without being answered**

- **4. Desktop and tablet layouts have never been validated by the client.** 3.4.0 escalated this
  for a brand mark on two surfaces. 4.0.0 escalates it by **an entire second product**: three
  features' worth of desktop-first administrative design, in a project whose only approved visual
  reference is a mobile-only 390×844 prototype frame. The administrative product is desk work, so it
  is *predominantly* the width band nobody has ever reviewed. **This amendment does not close it.**

**Open — require a client decision**

*Numbering is stable.* Resolved entries are **struck through in place** rather than removed, and
their successors are not renumbered — see the 2.3.0 sync report for why. They are kept in the list
rather than left as gaps because Markdown renderers ignore explicit ordinals and renumber sequentially,
so a gap in the source would silently render as the wrong number against a neighbouring entry.

1. **What "PS" denotes** in the repository name `mynet-ps`.
2. ~~**Real brand mark and application icons.**~~ **RESOLVED 2026-08-10 in 3.4.0** — the project
   owner supplied a brand board, and the supply is the client decision this entry was waiting for.
   See "Brand identity and application icons" under Technology and Architecture Constraints, which
   is now the binding statement. Carried forward from this entry's life: it was right that no mark
   was drawn here in the meantime, and the deliberately ugly placeholder — a coral disc struck
   through by an amber band — is why the gap stayed visible for the whole of it.
3. **`GroundZero/requirements.md` is now knowingly out of step** with this constitution on product
   name, delivery mode, persistence, authentication, and routing. Whether it is amended or the
   divergence is recorded is undecided.
4. **Desktop and tablet layouts have never been validated by the client.** The approved prototype is
   mobile-only at a fixed 390×844 frame. Every desktop layout built before this is answered is
   unreviewed design, so the cost of leaving it open compounds with each feature. *Escalated
   2026-08-07 in 3.0.0*: phase 006 adds a card-dense multi-column directory grid and a second modal
   overlay, making it the largest single addition of unreviewed desktop design so far.
5. ~~**Attendee identity model.**~~ **RESOLVED 2026-08-07 in 2.3.0** — self sign-up with an event
   join code. Retained in place so the numbering stays stable; see "Resolved in 2.3.0" above.
6. ~~**Data retention, deletion, and export obligations.**~~ **RESOLVED 2026-08-07 in 2.3.0** — full
   self-serve, written into Principle VIII. Retained in place; see "Resolved in 2.3.0" above.
7. ~~**The connection model behind Network contacts.**~~ **RESOLVED 2026-08-10 in 3.2.0** — a
   contact is someone whose digital business card you hold. No connect verb, no accept step, and
   contacts MUST NOT be derived from conversations. Now binding text under "Networking relationships
   and appointments" above. Retained in place so the numbering stays stable; see "Resolved in 3.2.0"
   below. Worth carrying forward: **half of this entry was closed by a different feature's decision**
   — 007's open send made a conversation unilateral, which eliminated the prototype's answer before
   anybody ruled on the entry itself. An entry can be narrowed by work that never names it.
8. ~~**What an exchanged digital card records, and whether the exchange is mutual.**~~ **RESOLVED
   2026-08-10 in 3.2.0** — one-directional, and it records the exchange rather than the person. Now
   binding text under "Networking relationships and appointments" above. Retained in place; see
   "Resolved in 3.2.0" below. **Entries 7 and 8 closed together with one decision**, having been
   filed as two, which is a caution about how the remaining entries are phrased rather than a
   criticism of these.
9. ~~**Audience-question attribution.**~~ **RESOLVED 2026-08-10 in 3.2.0** — questions are
   **attributed** to their author. The entry asked whether this makes Q&A a personal-data surface
   under Principle VIII; it does, and that consequence is now binding text under "Audience
   questions" above. Retained in place; see "Resolved in 3.2.0" below.
10. ~~**Notifications.**~~ **RESOLVED IN PART 2026-08-08 in 3.1.0** by M4 — engagement
    notification delivery enters product scope **for a received message and nothing else**, and is
    now binding text under "Notification delivery" above rather than a register entry. **The bell
    remains forbidden**, along with an in-app notification centre: that half of this entry is
    carried forward unchanged and unweakened, which is why the entry is resolved *in part* rather
    than closed. Retained in place so the numbering stays stable; see "Resolved in 3.1.0" above.
    Creates entry 20.

**Open — require an owner or planning decision**

11. ~~**API hosting, the managed PostgreSQL provider, and object storage.**~~ **RESOLVED 2026-08-07
    in 3.0.0** by D12 — two isolated Azure VMs (`uat`, `prod`), each running Caddy with automatic
    TLS in front of an API container and a **loopback-only PostgreSQL container**, with
    `StorageService` backed by a volume on the same host. All three halves of this entry close
    together, which is what the 2.3.0 widening anticipated. Retained in place so the numbering stays
    stable; see "Resolved in 3.0.0" below.
12. **Authentication ownership** — self-implemented versus a delegated provider.
13. ~~**Attendee avatar handling.**~~ **RESOLVED 2026-08-07 in 2.3.0** — real upload, with resizing
    and EXIF stripping mandatory. Retained in place; see "Resolved in 2.3.0" above.
14. **Public non-production URLs.** *Changed, not closed, 2026-08-07 in 3.0.0 by D13.* The original
    entry read "Public preview URLs" and named Cloudflare Pages previews, which are withdrawn. It is
    replaced by something **sharper, not milder**: a single long-lived UAT environment, publicly
    reachable, carrying realistically-shaped attendee data, and persisting between changes rather
    than being destroyed with each pull request. The data-separation half is now settled and binding
    (Deployment environments, above, carrying 001's FR-067 forward). **Access control remains
    undecided**, and it is now a question about a permanent address rather than a transient one.
    Interacts with entries 16 and 19.
15. **Server-side branch protection is unconfigured** — a configuration task, not an accepted risk.
    *Corrected 2026-08-07*: this entry previously recorded it as "unavailable (private repository,
    free personal account; APIs return 403)". **Both halves were wrong.** The repository is public
    and organisation-owned; the protection endpoints return **404 — no rule set** — and `rulesets`
    returns an empty list. Branch protection is free on public repositories. Until it is applied,
    enforcement is client-side only and bypassable with `--no-verify`.
16. **The repository is public and organisation-owned** — `Programa-Semilla/mynet-ps` — and nothing
    in this constitution recorded that. Whether it was intended, or is an artifact of how the
    repository was created, is undecided. It changes the Principle VIII threat model either way:
    committed seed data, migrations, workflow configuration, and the generated API contract are all
    world-readable, and preview deployments are reachable by anyone who finds them. This interacts
    with entry 14. *Added 2026-08-07*.
17. **The pipeline runs red, and most of the checks Principle VII names have never executed.**
    *Verified 2026-08-07*: every pull-request run of the `verify` workflow has concluded in failure,
    and every `develop` push run was cancelled. On the most recent run `lint`, `typecheck`, `build`,
    `contract` and `test-component` pass, while `test-unit` and `cleanup` fail — and `db-branch`,
    `schema-diff`, `migrations`, `test-integration`, `test-e2e`, `test-accessibility` and
    `deploy-api` are all **skipped**. Migration verification, integration tests against a real
    database, accessibility checks and end-to-end browser tests are therefore specified by Principle
    VII but have never once run. Features 001 and 002 both merged in this state. Under the breach
    clause added to Principle VII in 2.2.0 this MUST be waived or closed, and it MUST be closed
    before phase 005 merges, because 005's personal-data guarantees are enforced only by the
    integration suite. *Added 2026-08-07*.

    **Substantially closed 2026-08-07**, in two changes, and the remainder is narrower than the
    entry above describes. 005 gave the `unit` Vitest project the configuration
    `event-scope-audit.test.ts` needed, and `test-unit` passed in CI for the first time — so
    FR-230's route audit, the thing that fails the build when a conference-accepting route lacks
    its guard, now actually executes. PR #9 then found the real cause of the rest: the four
    database gates were bound to `db-branch`, so **one unset repository secret skipped every check
    that tests correctness**. They never needed a vendor — Principle VII asks for a real database,
    not a particular one — and they now run on per-job PostgreSQL service containers, which is
    stricter isolation than the shared branches they replace and depends on no secret at all. Run
    `31192787746` records `migrations`, `test-integration`, `test-accessibility` and `test-e2e`
    all passing for the first time.

    A second fault was found in the same change and is worth recording, because it would have
    outlived the first: `AUTH_PASSWORD_PEPPER` and `AUTH_ATTEMPT_HASH_KEY` were **never set in the
    workflow**, so these jobs would have failed one line further on even had the Neon secret been
    present. It was invisible only because `db-branch` failed first.

    **What remains open** is the preview path alone — `db-branch`, `schema-diff`, `deploy-api` and
    `deploy-preview` — which needs `NEON_API_KEY`, `NEON_PROJECT_ID`, `FLY_API_TOKEN` and the three
    Cloudflare values, plus a `preview-base` branch in the Neon project. The aggregate `verify`
    check stays red until those exist, which is the honest signal for missing provisioning. **No
    check was weakened to reach this state**; four that were skipped were made to run, which is the
    opposite of the shortcut FR-071 forbids.

    005 merged under a recorded waiver naming the then-unsatisfied checks (PR #8), before PR #9
    landed. *Annotated 2026-08-07.*

    **CLOSED 2026-08-07 in 3.0.0 — the remainder is resolved BY REPLACEMENT, not by provisioning.**
    D13 retires Fly, Cloudflare Pages and Neon, so `db-branch`, `schema-diff`, `deploy-api` and
    `deploy-preview` are **deleted**. The seven secrets they awaited are no longer needed, and the
    aggregate check can go green because its blocker no longer exists.

    **This is not the shortcut FR-071 forbids, and the distinction is worth stating precisely**: the
    four jobs removed verify nothing about correctness — they build environments. Every check that
    does verify correctness is unchanged and still runs: `typecheck`, `lint`, `test-unit`,
    `test-component`, `contract`, `migrations`, `test-integration`, `build`, `test-accessibility`
    and `test-e2e`. `test-e2e` was checked specifically and runs against a `postgres:17` service
    container, never against the preview. **Zero checks were weakened, disabled, or made
    non-blocking.**

    What *is* given up is the reviewer-facing guarantee, and it is recorded under Principle VII
    rather than buried here.

18. **The transactional email provider.** D8 settles that account mail is sent — verification and
    password reset — and that it is distinct from the excluded engagement notifications. By whom it
    is sent is undecided, and it brings one external dependency and one secret. Needed by phase 004.
    *Added 2026-08-07.*

    **WIDENED 2026-08-08 in 3.1.0.** M8 adds a third message to this dependency: operator abuse
    mail. The entry is unchanged in substance and larger in consequence — an unprovisioned provider
    now leaves a **safety** obligation undelivered as well as verification and recovery. It is not
    a blocker for the reporting feature, which blocks and records regardless and logs the skipped
    dispatch, but it means nobody is currently told a report was filed. Interacts with entry 21,
    which is the address rather than the sender, and with entry 20 — the push provider and the mail
    provider may well be answered together.
19. **Nobody moderates uploaded avatar images.** D5 opens public self sign-up and D7 admits image
    upload, in a product with no administrative actor by construction — and the
    organizer-administration exclusion in Principle III is precisely what forecloses the usual
    answer. Whether this is handled by automated classification, by a reporting path, by restricting
    who may upload, or by accepting the exposure is undecided. Cheapest to settle before the first
    publicly reachable preview, and interacts with entries 14 and 16. *Added 2026-08-07.*

    **ESCALATED 2026-08-07 in 3.0.0.** When this entry was written, an uploaded image was visible on
    one profile page to whoever navigated to it. Phase 006 renders co-attendee faces **in a
    directory, to every attendee of the conference, by default** — which converts an unmoderated
    upload from a private artifact into a published one. The entry is unchanged in substance and
    materially larger in consequence. Now interacts with entry 14 in its new form: a permanent,
    publicly reachable UAT carrying real-shaped profile images.

    **ESCALATED AGAIN 2026-08-08 in 3.1.0.** Phase 007's open send means any attendee sharing a
    conference may open a conversation with any other, with no request and no acceptance step, and
    a conversation once open is permanent. An unmoderated avatar is therefore now visible in a
    thread header to somebody the attendee never chose to be seen by — and the closest thing to a
    moderation answer this project has is the block and report path 007 ships, which is
    per-person, after the fact, and routes to an operator who does not yet exist (entries 18, 21).
    Still unchanged in substance.

    **ADDRESSED, NOT CLOSED, 2026-08-11 in 4.0.0 by A1.** This entry has been unanswerable for its
    whole life for a reason it states itself: the organizer-administration exclusion "is precisely
    what forecloses the usual answer". That exclusion is now reversed, and feature 011 introduces the
    first actor in this project capable of acting on an uploaded image. **A capability is not a
    policy**, which is why this stays open: who moderates, against what standard, on whose complaint,
    with what appeal, and whether a removed avatar is replaced or blanked are all undecided. What has
    changed is that the answer is now buildable. *This entry MUST NOT be read as closed by the
    existence of feature 011.*

20. **The push provider, and VAPID key custody.** *Added 2026-08-08 in 3.1.0, created by M4.* The
    project's second pending external dependency and secret after entry 18, and the two may well be
    answered together. Two halves, and the second is the one that needs a person rather than a
    vendor comparison: **who holds the VAPID private key**, where it lives for each of the two
    environments, and what happens when it is rotated — a rotated key invalidates every existing
    subscription, so every attendee silently stops receiving until their browser re-registers.
    Blocks only the real adapter: the port, the sink adapter and every test against it are buildable
    without it, exactly as `SinkMailService` is for entry 18.
21. **The operator address abuse reports are dispatched to, and the response expectation attached to
    it.** *Added 2026-08-08 in 3.1.0, created by M8.* Not a vendor question — **an obligation the
    owner personally holds.** Somebody has to read that inbox, and the product deliberately promises
    the reporter nothing it cannot keep: no case identifier, no status, nothing to poll, because
    FR-548 forbids the surface that would answer any of them. What the reporting dialog says today
    is that a person will read it. **That sentence is only true once this entry is answered.**
    Interacts with entry 18 (who sends it) and entry 19 (it is the nearest thing to a moderation
    path this product has).

    **CHANGED, NOT CLOSED, 2026-08-11 in 4.0.0 by A5.** The entry was written as a question about an
    address, and half of that framing is now obsolete: a platform operator reading a queue keeps the
    dialog's promise without any mail being sent. What survives is the harder half, unchanged in
    force — **somebody has to be that operator.** A queue nobody opens is exactly as empty a promise
    as an inbox nobody reads, and this remains an obligation the owner personally holds rather than a
    vendor question. Two consequences: the mail path is **not** deleted, because an operator who must
    open a site to learn a report exists learns late; and what the queue may disclose becomes its own
    entry (24) rather than part of this one.
22. **A cached conference outlives a withdrawn registration by up to 24 hours.** *Added 2026-08-10
    in 3.3.0, created by Q2. Against phase 010.* The offline caching decorator revokes on **age
    alone** — a 24-hour lifetime keyed `(attendeeId, eventId, resource)` — so when the server begins
    refusing an attendee who has withdrawn from a conference, or been removed from it, the
    programme, saved sessions and notes already on their device stay readable until the entry
    expires. **A refused write is the only moment the client learns the answer changed**, and no
    undecorated repository purges on one: Messages, Discover, cards, profile and now Q&A all refuse
    without purging, and have since each shipped.

    **This entry exists because 009 declined to fix it, and the decline is deliberate.** 009 had a
    requirement for it — FR-756a, that a refused Q&A action must invalidate that conference — and
    withdrew it, because what the requirement asks of Q&A is to purge **other features'** caches: a
    cross-feature responsibility no other undecorated repository carries, discharged from whichever
    feature happened to notice. Building `purgeOnRefusalOnly` into
    `packages/data/src/http/cached.ts` would add a mechanism to a file every feature shares,
    exercise it from exactly one, and leave the hole open everywhere else. **The gap is
    product-wide and older than 009**, and an undeclared decline is indistinguishable from an
    oversight — which is the whole reason this is written down rather than absorbed.

    What it is **not** is a data-retention breach: the data is the conference programme, not another
    attendee's personal data, and Discover and Messages are uncached precisely so that other
    people's data is never what ages on a device. It is a **stale-authorization** window, bounded at
    24 hours, on content the attendee was legitimately shown.

23. **Whether the design tokens adopt the brand's navy and coral.** *Added 2026-08-10 in 3.4.0,
    created by B4.* Measured from the supplied board, the brand and the tokens disagree: brand navy
    `#0d1942` against `navy-800 #1b2340`, brand coral `#fe6551` against `coral-500 #e8634d`. Cream
    agrees and is not at issue. Adopting the brand values would make the board the single source of
    truth for colour and remove the seam between the icon plate and the token-derived `theme_color`
    on the splash screen. **The cost is that it repaints the entire product**: `navy-800` is the
    primary surface and `coral-500` is both the accent and the focus ring, so every contrast ratio
    the accessibility suite asserts must be re-verified on new values. **Blocks nothing** — the
    product behaves as specified either way, and feature 010 is explicitly forbidden from resolving
    it. What it costs to leave open is one visible seam on one surface.

24. ~~**What the administrative report queue may disclose.**~~ **RESOLVED 2026-08-11 in 4.1.0 by
    A8** — the reported content **and** the reporter's stated reason, to platform operators only,
    under four scoping conditions now recorded as the **third** Principle VIII exception. Retained
    in place so the numbering stays stable. The entry's own framing below was right that this needed
    an amendment rather than a specification, and it is preserved because the reasoning is the
    artifact. *Original entry, as written in 4.0.0:*

    *Added 2026-08-11 in 4.0.0, created by
    A5. Blocks feature 011's report surface, and nothing else.* 3.1.0 bound operator mail to
    identifiers and a timestamp — never message text, never the reporter's reason — on the ground
    that both are two attendees' personal data and an inbox sits outside every retention rule this
    project controls. **An in-product queue is not an inbox**, so the second half of that reasoning
    does not transfer, and the question is genuinely open rather than settled by analogy.

    The floor is fixed and needs no decision: the queue MUST NOT show more than the mail does until
    this entry is answered. What needs one is whether it may show more. **A queue showing reported
    message text would be a THIRD recorded exception under Principle VIII** — and 3.3.0 established
    that an exception must be *recorded* rather than derived, on an entailment argument that was
    available and deliberately not taken. The available argument here is that a moderator cannot
    judge conduct they cannot see, and it must not be taken silently either.

    Interacts with entry 21 (who the operator is) and entry 19 (an avatar is content a moderator must
    see to act on, which is the same question in a different medium).

25. ~~**What happens when a promoted conference organizer deletes their own account.**~~ **RESOLVED
    2026-08-11 in 4.1.0 by A9** — assignments are revoked in the same transaction, deletion is never
    made conditional, and the conference enters an explicit `unassigned` state that platform
    operators can see. **The same rule applies to withdrawal**, which answers the adjacent question
    this entry carried. Now binding text under "Administration, and the second actor". Retained in
    place so the numbering stays stable. *Original entry:*

    *Added
    2026-08-11 in 4.0.0. Blocks feature 011.* Two commitments collide, and neither yields cleanly.
    D6 and Principle VIII make deletion **self-serve, hard, and cascading, with no tombstone** — an
    attendee MUST be able to delete their own account without an intermediary. A conference organizer
    is an attendee. So the sole organizer of a conference can orphan it by exercising a right this
    document guarantees, and the sessions they authored are **conference content**, not attendee
    data, so they survive with nobody assigned to them.

    The obvious repairs each break something recorded. Refusing the deletion breaks D6. Requiring a
    second organizer first breaks it more subtly, by making the right conditional on somebody else's
    action. Cascading the conference away destroys content belonging to every attendee registered for
    it — the shape 3.3.0 rejected for Q&A votes and then accepted anyway for a different reason,
    which is precisely why it must be argued rather than copied. **Do not resolve this by analogy to
    008's or 009's deletion answers**: both concerned data the departing person authored about
    themselves, and a conference is not that.

    The adjacent question travels with it: whether withdrawing from a conference revokes an organizer
    assignment for it. 008 established that withdrawal cancels live meetings in the same transaction;
    whether the same reasoning reaches an assignment is undecided.

26. ~~**The administrative site's origin and session topology.**~~ **RESOLVED 2026-08-11 in 4.1.0 by
    A7** — a subdomain of the same registrable domain, `/api/*` reverse-proxied under it, and a
    host-only session cookie giving two independent sessions. Now binding text under "Deployment
    environments". Retained in place so the numbering stays stable. **What closed it was a
    distinction, not a preference**: `SameSite` is evaluated against the registrable domain rather
    than the origin, so a subdomain is same-site *and* different-origin — the only shape that keeps
    D11's CSRF defence while giving the administrative app its own service-worker scope, storage and
    CSP. *Original entry:*

    *Added 2026-08-11 in 4.0.0, created by
    A3. Blocks feature 011.* D11 binds client and API to **one origin**, and the block above states
    why in terms that forbid casual reinterpretation: it "is what keeps the session cookie's
    `SameSite` attribute a genuine CSRF defence rather than a nominal one, and it is why no
    synchroniser-token scheme is required. A topology that splits them MUST NOT ship without one."

    A second website is a second origin unless deliberately arranged otherwise, and **the
    administrative product MUST NOT inherit D11's reasoning unexamined**. This is the exact failure
    3.0.0 was written to escape: `fly.dev` and `pages.dev` are separate registrable domains on the
    Public Suffix List, the `SameSite=Lax` cookie was therefore never sent, and **the configuration
    could not sign anyone in** — a defect that survived because the topology was assumed rather than
    decided.

    Open in three parts: whether administration is a subdomain, a path, or a separate registrable
    domain; whether an administrative session is a distinct session from the attendee one held by the
    same person; and, if the origins differ, what replaces `SameSite=Lax`. Two long-parked idea-inbox
    entries meet this directly — `session-topology-and-csrf` and `security-response-headers`, both
    filed on 2026-08-05 as cheapest to settle before the first environment is opened, and both still
    unsettled.

**Runtime guidance**: `CLAUDE.md` provides durable project context for AI-assisted sessions. It MUST
stay consistent with this constitution and MUST NOT contain implementation plans, session tasks,
progress updates, or invented requirements.

**Version**: 4.1.0 | **Ratified**: 2026-08-04 | **Last Amended**: 2026-08-11
