# Feature Specification: Attendee Identity, Personal Data and Profile

**Feature Branch**: `spec/004-attendee-identity-and-profile`

**Created**: 2026-08-07

**Status**: Draft

**Constitution**: v2.3.0

**Brainstorm**: `brainstorm/04-attendee-identity-and-profile.md`

**Input**: Phase 004 of the delivery roadmap, unblocked on 2026-08-07 when constitution v2.3.0 closed
the three register entries that had gated it. Give a person a way to become an attendee under their
own power, a profile of their own authorship, and full self-serve control of the personal data the
product holds about them.

---

## Context and Scope Note

Every attendee who exists today was put there by a seed script. `apps/api/src/routes/auth/` carries
`sign-in`, `sign-out` and `me`, and nothing else — there is no way to create an account, no way to
recover one, and no way to delete one. `attendees` holds an email and a display name; the company,
role, interests, networking intent and availability that `requirements.md` describes are nowhere in
the schema. This feature is where a person becomes an attendee, describes themselves, and can leave.

It is also where the product's standing personal-data commitments become real rather than declared.
005 shipped an `ON DELETE CASCADE` over notes and saved sessions and asserted it with an integration
test, on a narrow declared commitment that personal content is *deleted with the account*. That
guarantee has been **operationally unreachable since the day it shipped**, because no route can
delete an account. This feature is what finally gives it something to fire.

### Departure from the delivery roadmap

The roadmap (`docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`) is the
authoritative decomposition of the product. It is a plan rather than governance and may be revised
without a constitutional amendment, but it requires a feature that departs from it to say so. **This
feature departs from it more than any prior phase has**, and the departure was decided deliberately
in brainstorm #04.

| | Roadmap | This feature |
|---|---|---|
| Scope | Profile fields, own-profile view and edit | **Plus** self sign-up, event join, email verification, password recovery, account deletion, personal-data export, and a retention purge |
| Identity model | An **input** to this phase, to be settled before it is specced | **Delivered by** this phase |
| Home card | — (none) | **— (none).** Unchanged |
| Migration `0003` | Reserved for 004 | **Unchanged** — this feature emits `0003`, and only `0003`. See below |
| Phases 006–010 | — | **Unchanged** |

**Why the phase grew.** The roadmap treated the identity model as a decision that would arrive from
outside and then be applied. It did not arrive, which is why 004 sat blocked while 005 and 006 were
resequenced around it. When brainstorm #04 settled it as **self sign-up**, that answer carried
obligations the roadmap had not costed: a person who signs themselves up can forget their password,
and there is no organizer to help them; a person who signs themselves up can ask to leave, and there
is no organizer to process the request. Delivering the profile without those would ship an account
nobody can recover and nobody can close.

**The alternative was considered and rejected.** Brainstorm #04 offered a staged split — decide the
model now, ship profile editing against the seeded roster, and make sign-up its own later phase. It
was rejected because it leaves the recovery gap open across every intervening phase while the
population it affects cannot grow, which is the worst of both.

**The cost, accepted and recorded.** This feature reaches into authentication code that 001 owns —
credential storage, the sign-in session, the throttle — which the roadmap's phase-parallelism
analysis did not anticipate. It has no parallel partner, so there is no contention, but it does mean
004 is no longer a leaf feature. **A split into reviewable pull requests is expected** once tasks
exist, and is recorded as the first thing to settle after this specification.

**On migration `0003`, and why there is exactly one.** The roadmap reserved `0003` for this phase, and
that reservation is honoured. It is worth stating why this feature does **not** claim a second number
even though its schema change is wide: `0004` is already spent by 005, `0005` is reserved by 006, and
`0006` and `0007` are reserved by 007 and 008. **There is no free number adjacent to `0003`.** A
second migration here would have to take a number another phase has already reserved, or leave 004's
migrations non-contiguous across three later reservations. The schema change is wide but coherent —
one addition describing one subject, the attendee — so it ships as one migration. **If implementation
proves it must split, the reservations for 007 and 008 MUST be renumbered in the same change**, and
this feature MUST NOT silently take a number another phase holds.

### What this feature does *not* change

**The organizer-administration exclusion holds, and this feature is the closest the product has come
to it.** Principle III puts organizer administration out of scope, and the content-provenance
constraint adds that seed data must not become a route around it. Self sign-up does not breach either:
there is no administrative interface, no privileged role, and no content import path. **A join code
carried on a seeded conference row is seed data, not an administrator.** No attendee gains any
capability over another attendee, over any conference, or over any conference's content.

**`CatalogRepository` stays read-only in perpetuity.** Nothing here writes conference content. A
conference's join code is *read* during registration and is never written by any attendee action.

**No card is added to Home, and no existing card is edited.** The roadmap assigns 004 no Home
contribution and this feature takes none. Standing decision 9 is untouched.

**No existing table's event-scoping rule changes.** `registrations` continues to be the per-event
join it already is.

### A note on vocabulary

As in 002 and 005, this specification says **conference** where the domain vocabulary says **Event**.
They are the same thing and the mapping is exact. It says **join code** for the value an attendee
enters to register for a conference; no new domain term is introduced beyond that one.

### Where this feature's surfaces live

The five destinations are fixed and this feature adds none.

- **Outside the authenticated shell**, alongside the existing sign-in screen: sign-up, join a
  conference, verify an email address, request a password reset, and set a new password. These are
  reachable without a session by necessity — a person signing up does not have one.
- **Inside the shell**: the attendee's own profile, its edit surface, the discoverability control,
  the export action, and the delete-account action. Where these live in the shell's navigation is a
  presentation question recorded in Open Questions; they are **not** a sixth destination.
- Agenda, Discover, Messages and Network are untouched by this feature. Discover remains a
  placeholder — 006 is what reads the profiles this feature authors.

### Why this specification names some technical shapes

Convention says a specification states WHAT and defers HOW, and 002 and 005 both recorded the same
exception for the same reason. A small number of requirements here are irreducibly structural,
because they constrain properties the project has already committed to and that later features
inherit: authorization that cannot be forgotten (FR-385–FR-391), deletion coverage that a later
feature cannot quietly omit (FR-364–FR-371), export coverage with the same property (FR-373–FR-379),
and a storage boundary that keeps an unprovisioned vendor from blocking the feature (FR-352).

Where a requirement constrains structure it constrains the **property** — "no personal-data table may
exist that neither cascades nor expires", "no field may be collected that the export omits" — never
the mechanism. The mechanisms belong to the plan.

---

## Clarifications

### Session 2026-08-07 (brainstorm #04, ratified as constitution v2.3.0)

- **How does a person become an attendee?** → Self-serve sign-up, plus registration for a conference
  by entering a join code carried on the seeded conference row. Three of the register's four
  candidate models — event invitation, organizer-provisioned, ticket holder — were never available
  under Principle III and the seed-data clause.
- **Verification and recovery send email. Does that breach the notification exclusion?** → No. The
  exclusion covers **engagement** notifications; **transactional account mail is in scope**. The
  notification bell remains forbidden.
- **What are the retention, deletion and export obligations?** → Full self-serve: hard deletion with
  cascade and no tombstone, machine-readable export, and a retention clock for personal-data records
  no cascade can reach. Built to the strict standard so that settling jurisdiction is not a
  precondition.
- **Seeded avatars or real upload?** → Real upload, with resizing and EXIF stripping mandatory.
- **Where do image bytes live?** → Behind a `StorageService` platform interface, with a local
  implementation for development, test and preview. The production provider folds into register
  entry 11.
- **Who can see a profile?** → Attendees registered for the same conference, enforced server-side,
  with a single discoverability toggle. Per-field visibility was considered and rejected.

### Session 2026-08-07 (specification)

Two questions the brainstorm did not reach, raised because no reasonable default existed.

- **Is the conference join code a secret, given the repository is public?** → **No.** Real codes are
  committed in seed data and the code is explicitly not an access control (FR-317a, FR-317b). It gates
  a person landing in a conference they have no business being in; it is not what keeps anyone's data
  private, because every profile sits behind both a shared registration and the owner's
  discoverability setting.
- **What does an unverified email address prevent?** → Answered **nothing**, then narrowed at the
  review below to **discoverability only** (FR-324, FR-325). Verification establishes that the address
  can receive mail, which is what makes recovery meaningful; the primary journey still completes in
  one sitting, which matters while the mail provider is unprovisioned (register entry 18).

### Session 2026-08-07 (specification review)

The review gate found two requirement pairs that could not both hold, and one exposure that neither
question above had surfaced. All three were decided by the project owner.

- **Sign-up cannot both auto-sign-in and hide whether an address is registered.** → **Disclosure is
  accepted** (FR-303). The two outcomes are distinguishable whatever the wording says, so a
  non-disclosure requirement would have been satisfied on paper and defeated in practice. Rate
  limiting is what actually defends enumeration. **The password-reset path keeps its non-disclosure
  guarantee** (FR-327), where the outcome genuinely is identical either way.
- **Three separately-sound decisions compounded into an impersonation surface.** A public join code,
  an unverified address preventing nothing, and profiles visible to co-attendees would together have
  let anyone sign up **using an address they do not own**, join any conference, and appear in a
  professional directory as that person. → **Verification now gates discoverability** (FR-325,
  FR-325a, FR-359). Nothing else is gated, so the one-sitting journey survives. The recorded
  consequence reverses: **006 may now assume every profile it can read carries a verified address.**
- **Registration was over-constrained.** A draft requirement forbade treating registration as an
  authorization event at all, which contradicted FR-357 and 002's shipped event-scoping predicate. →
  Narrowed: registration is evidence of **presence, not vetting** (FR-317b). It may gate scope; it
  may never be read as identity assurance.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A person creates an account and joins a conference (Priority: P1)

A person who has never used MyNet arrives, creates an account with their email address, display name
and a password, and registers for a conference by entering its join code. They arrive at Home for
that conference, greeted by name, exactly as a seeded attendee does today.

**Why this priority**: Nothing else in this feature is reachable without it, and it is the capability
whose absence blocked the phase. Until it exists the product's population cannot grow.

**Independent test**: Starting from a database containing conferences but no accounts, complete
sign-up and join, and confirm the new attendee reaches Home with the conference active.

**Acceptance scenarios**:

1. **Given** no account for an email address, **When** the person submits that address, a display
   name and a valid password, **Then** an account is created and they are signed in.
2. **Given** an account already exists for an email address, **When** a person submits that address
   at sign-up, **Then** they are told the address is already registered, no second account is
   created, and they are offered the sign-in and password-reset paths.
3. **Given** a signed-in attendee with no conference registration, **When** they enter a valid join
   code, **Then** they are registered for that conference and it becomes their active conference.
4. **Given** a signed-in attendee, **When** they enter a join code that matches no conference,
   **Then** they are told the code was not recognised, in wording that does not distinguish "no such
   code" from any other rejection.
5. **Given** an attendee already registered for a conference, **When** they enter that conference's
   join code again, **Then** no duplicate registration is created and they are told they are already
   registered.
6. **Given** a password that does not meet the stated requirements, **When** the person attempts to
   submit, **Then** **confirmation is disabled** and the requirement is stated — never a post-submit
   error.
7. **Given** an attendee registered for no conference at all, **When** they reach the shell, **Then**
   they are invited to join one rather than shown an empty conference.

---

### User Story 2 — The attendee verifies their address and recovers a forgotten password (Priority: P2)

The attendee confirms they own the email address they signed up with, and — when they later cannot
sign in — asks for a reset link and sets a new password.

**Why this priority**: Self sign-up without recovery creates accounts that are permanently lost on a
forgotten password, with no organizer to appeal to. It is the obligation the identity decision
carried with it.

**Independent test**: Sign up, follow the verification link, then sign out, request a reset, follow
the reset link, set a new password, and sign in with it.

**Acceptance scenarios**:

1. **Given** a newly created account, **When** it is created, **Then** a verification message is sent
   to the address, and the account records that the address is not yet verified.
2. **Given** an unexpired verification link, **When** the attendee follows it, **Then** the address is
   marked verified, the link cannot be used a second time, and — if their discoverability setting is
   on — they become visible to co-attendees for the first time.
3. **Given** an expired verification link, **When** it is followed, **Then** it is refused with an
   explanation and the attendee can request a new one.
4. **Given** any email address, **When** a password reset is requested for it, **Then** the response
   is identical whether or not an account exists, so the surface cannot be used to discover who has
   an account.
5. **Given** an unexpired reset link, **When** the attendee follows it and sets a valid new password,
   **Then** the password is changed, the link cannot be reused, and **every existing sign-in session
   for that attendee is invalidated**.
6. **Given** a reset link, **When** a second reset is requested before the first is used, **Then** the
   earlier link stops working.
7. **Given** a password change, **When** it completes, **Then** no message containing the password is
   ever sent, stored or logged.

---

### User Story 3 — The attendee authors their profile (Priority: P3)

The attendee fills in who they are — company, role, headline, interests, networking intent and
availability — and edits it later.

**Why this priority**: It is the roadmap's stated purpose for this phase, and 006 cannot show a
directory of people who have not described themselves.

**Independent test**: As a signed-in attendee, complete every profile field, reload, and confirm the
values persist; edit one and confirm the change persists.

**Acceptance scenarios**:

1. **Given** a newly created account, **When** the attendee opens their profile, **Then** every field
   is empty and the surface invites completion rather than showing a broken record.
2. **Given** a profile in edit, **When** a required field is empty or a field exceeds its stated
   limit, **Then** **confirmation is disabled** with the reason stated — never a post-submit error.
3. **Given** valid edits, **When** the attendee confirms, **Then** the changes persist and are
   visible on reload and on another device.
4. **Given** an attendee viewing their own profile, **When** it renders, **Then** it shows their own
   data only, and no control offers to edit anyone else's.
5. **Given** networking intent and availability, **When** they are set, **Then** they are the
   attendee's own choices and no other attendee and no seed process can change them.

---

### User Story 4 — The attendee sets a photograph as their avatar (Priority: P4)

The attendee uploads a photograph of themselves, sees it on their profile, replaces it, and removes
it.

**Why this priority**: A networking product where nobody has a face is a directory of strings. It
ranks below the text profile because the profile is usable without it.

**Independent test**: Upload an image, confirm it renders; upload a replacement; remove it and
confirm a non-photographic fallback renders.

**Acceptance scenarios**:

1. **Given** an image within the stated size and format limits, **When** the attendee uploads it,
   **Then** it is stored and rendered as their avatar.
2. **Given** an uploaded photograph containing location metadata, **When** it is stored, **Then**
   **the metadata is removed**, and what is stored and served carries no camera, location or
   timestamp information from the original.
3. **Given** an image exceeding the size limit or of an unaccepted type, **When** upload is attempted,
   **Then** it is refused with the limit stated, before any bytes are stored.
4. **Given** an existing avatar, **When** a new one is uploaded, **Then** it replaces the previous
   one and the previous bytes are no longer retrievable.
5. **Given** an attendee with no avatar, **When** their profile renders anywhere, **Then** a
   non-photographic fallback renders and no broken image appears.
6. **Given** an attendee with an avatar, **When** they remove it, **Then** the bytes are deleted and
   the fallback returns.

---

### User Story 5 — The attendee controls whether they are discoverable (Priority: P5)

The attendee decides whether other attendees at their conferences can find them.

**Why this priority**: It is the counterweight that makes co-attendee visibility defensible. It ranks
here because it is small, but it is not optional — the constitution records it as the exception that
must exist.

**Independent test**: With two attendees registered for one conference, confirm each can retrieve the
other's profile; turn the first attendee's discoverability off; confirm the second can no longer
retrieve it, and that the first's own view is unchanged.

**Acceptance scenarios**:

1. **Given** two attendees registered for the same conference, **When** one requests the other's
   profile, **Then** it is returned.
2. **Given** two attendees with no conference in common, **When** one requests the other's profile,
   **Then** it is refused, and the refusal discloses nothing about whether that attendee exists.
3. **Given** an attendee who has turned discoverability off, **When** another attendee at the same
   conference requests their profile, **Then** it is refused identically to the previous case.
4. **Given** an attendee whose address is **not verified**, **When** another attendee at the same
   conference requests their profile, **Then** it is refused identically again — the requester cannot
   tell which of the three causes applied.
5. **Given** an attendee who has turned discoverability off, **When** they view their own profile,
   **Then** it is unchanged and they are told plainly what the setting currently does.
6. **Given** an unverified attendee with discoverability on, **When** they view their own profile,
   **Then** they are told plainly that verifying their address is what will make them visible.
7. **Given** the setting, **When** it is changed, **Then** it takes effect on the next request without
   requiring a new sign-in.

---

### User Story 6 — The attendee takes a copy of everything the product holds about them (Priority: P6)

The attendee asks for their data and receives a machine-readable file containing all of it.

**Why this priority**: It is half of the obligation the constitution now binds, and it is the half
that is cheap to satisfy while the data is small and hard to retrofit once six features have added
tables.

**Independent test**: As an attendee with a profile, an avatar, saved sessions and notes, request an
export and confirm every stored field appears in it.

**Acceptance scenarios**:

1. **Given** an attendee with data across several features, **When** they request an export, **Then**
   they receive a machine-readable file containing every field stored about them, including their
   avatar.
2. **Given** an export, **When** it is inspected, **Then** it contains no data belonging to any other
   attendee.
3. **Given** an export, **When** it is inspected, **Then** it contains **no credential material** of
   any kind.
4. **Given** a field collected by any feature, **When** the export is generated, **Then** that field
   appears in it — a field collected but not exported is a defect, not an omission.
5. **Given** an export request, **When** it is made by an unauthenticated caller or for another
   attendee's identifier, **Then** it is refused.

---

### User Story 7 — The attendee deletes their account (Priority: P7)

The attendee closes their account, and everything the product holds about them goes with it.

**Why this priority**: The other half of the same obligation, and the thing that makes 005's existing
cascade meaningful for the first time.

**Independent test**: As an attendee with a profile, an avatar, registrations, saved sessions and
notes, delete the account and confirm every record is gone from the database — not marked, gone.

**Acceptance scenarios**:

1. **Given** a signed-in attendee, **When** they confirm deletion, **Then** their account and every
   record attributable to them is removed, and they are signed out.
2. **Given** deletion, **When** it completes, **Then** **no tombstone, soft-delete marker or retained
   shadow record remains** — a record marked deleted is a record still held.
3. **Given** deletion, **When** it completes, **Then** the attendee's saved sessions, notes,
   registrations, active-conference selection, avatar bytes and sign-in sessions are all gone.
4. **Given** a deletion action, **When** it is offered, **Then** it requires an explicit confirmation
   that states plainly that it cannot be undone and that no copy is retained.
5. **Given** deletion, **When** it completes, **Then** it is not reversible by any surface in the
   product.
6. **Given** any table added by any feature that stores attendee data, **When** an account is deleted,
   **Then** its rows for that attendee are removed — verified by an automated test that fails when a
   new personal-data table is added without coverage.

---

### User Story 8 — Nobody reads or writes another attendee's identity or personal data (Priority: P8)

Every surface this feature adds is bound to the authenticated attendee, server-side.

**Why this priority**: Stated last because it constrains all seven stories above rather than adding a
capability. It is not optional and it is not deferrable.

**Independent test**: Exercise every route this feature adds against the server directly, as an
unauthenticated caller and as a different signed-in attendee, and confirm each is refused.

**Acceptance scenarios**:

1. **Given** any profile-write, export, deletion or discoverability route, **When** it is called
   without a session, **Then** it is refused.
2. **Given** any of those routes, **When** it is called by a signed-in attendee with another
   attendee's identifier, **Then** it is refused and the identifier in the request is never trusted
   in preference to the session.
3. **Given** a profile read for another attendee, **When** it is served, **Then** the shared-conference
   and discoverability conditions are both checked server-side before any data is returned.
4. **Given** a refusal on any of these paths, **When** it is returned, **Then** it discloses nothing
   about whether the target record exists.
5. **Given** the sign-up and reset routes, which are necessarily unauthenticated, **When** they are
   called repeatedly, **Then** they are rate-limited by the same defence that protects sign-in.

---

### Edge Cases

- **An address is used to sign up twice.** The second attempt is refused, says so plainly, creates no
  second account, and offers sign-in and reset. The disclosure is accepted — see FR-303.
- **A person signs up and never verifies.** They use the product fully and indefinitely (FR-324), but
  never appear to other attendees (FR-359) and cannot recover a forgotten password. Those two are the
  whole cost of not verifying.
- **A person signs up with an address belonging to someone else.** They can use the product, but they
  cannot appear in any conference's directory under it, because discoverability requires verification
  and they cannot receive the message. The real owner, on trying to sign up, is told the address is
  already registered and can recover it through the reset path — which does reach them.
- **An attendee verifies, becomes discoverable, then changes their address.** Out of scope; the spec
  provides no address-change path, which is recorded in Out of Scope rather than left ambiguous.
- **A reset link is followed after the account has been deleted.** It must fail as an expired link
  would, disclosing nothing.
- **An attendee deletes their account while signed in on a second device.** The second session must
  stop working; it must not present a signed-in shell for an attendee who no longer exists.
- **An attendee deletes their account, then signs up again with the same address.** Permitted — see
  Assumptions — and the new account starts empty, inheriting nothing.
- **An avatar upload is attempted offline.** Refused, with the file not lost from the form.
- **An export is requested for an attendee with no profile and no conference.** Produces a valid file
  describing an account and nothing else, not an error.
- **The join code of a conference the attendee is already registered for.** Idempotent, not an error.
- **A conference with no join code seeded.** Cannot be joined; must fail cleanly rather than admitting
  everyone or crashing.
- **Two attendees at one conference, both undiscoverable.** Discover shows an empty directory with the
  reset-filter affordance `requirements.md` requires, not a failure.
- **The retention purge runs while sign-in attempts are being written.** Must not interfere with
  throttling correctness.

---

## Requirements *(mandatory)*

### Account creation

- **FR-300**: A person MUST be able to create an account without any prior invitation, approval, or
  action by another party.
- **FR-301**: Account creation MUST collect an email address, a display name, and a password, and
  MUST NOT collect any other personal data at that moment.
- **FR-302**: The email address MUST be unique product-wide, not per conference.
- **FR-303**: A sign-up attempt for an address that already has an account MUST be refused, MUST NOT
  create a second account, and MUST say plainly that the address is already registered. *Decided at
  the specification review, 2026-08-07.* **This deliberately discloses registration status**, and the
  disclosure is accepted rather than overlooked. Non-disclosure is unachievable alongside FR-306: if a
  new address signs the person in and an existing one does not, the two outcomes are distinguishable
  whatever the wording says, so a non-disclosure requirement here would have been satisfied on paper
  and defeated in practice. Enumeration is defended by rate limiting (FR-307), which is what actually
  defends it. **The password-reset path keeps its non-disclosure guarantee** (FR-327), where the
  outcome genuinely is identical either way.
- **FR-304**: Password requirements MUST be stated before submission, and a password failing them
  MUST leave confirmation **disabled** rather than producing a post-submit error.
- **FR-305**: The password MUST be stored only as an irreversible hash, never in plaintext, and MUST
  NOT appear in any log, error, export, or stored record.
- **FR-306**: A newly created account MUST be signed in on success without a second credential entry.
- **FR-307**: Account creation MUST be rate-limited by the same defence that protects sign-in,
  counted by both identifier and request source.
- **FR-307a**: **Each throttled action MUST be counted separately.** This feature adds four throttled
  unauthenticated actions to a defence built for one — sign-up, join-code entry, reset request, and
  reset completion — and if they shared a counter, a sign-up or join-code storm aimed at an address
  would lock its rightful owner out of *signing in*. Exhausting one action's allowance MUST NOT
  consume another's. The existing sign-in behaviour MUST be unchanged by this feature.
- **FR-308**: An account MUST be creatable while registered for no conference, and the product MUST
  present a way to join one rather than an empty conference.

### Joining a conference

- **FR-310**: An attendee MUST be able to register for a conference by entering a join code.
- **FR-311**: The join code MUST be carried on the seeded conference record. No attendee action and
  no product surface may create, change, or delete one.
- **FR-312**: Registration MUST create exactly one registration per attendee per conference; entering
  a code for a conference already registered MUST be idempotent and MUST say so.
- **FR-313**: An unrecognised code MUST be refused in wording that does not distinguish between
  causes of rejection.
- **FR-314**: Code entry MUST be rate-limited, so the surface cannot be used to enumerate valid
  codes.
- **FR-315**: On first registration the joined conference MUST become the attendee's active
  conference.
- **FR-316**: Registering for a conference MUST NOT grant any capability over that conference's
  content, over its other attendees, or over any other conference.
- **FR-317**: A conference with no join code MUST be unjoinable, and MUST fail cleanly rather than
  admitting all comers.
- **FR-317a**: The join code is **not a secret**, and MUST NOT be treated as an access control. Real
  codes are committed in seed data, and the repository being public (register entry 16) is accepted
  rather than worked around. *Decided 2026-08-07.* The reasoning MUST be stated wherever the code is
  defined, so a later reader does not mistake it for a credential: possessing a code lets a person
  register for a conference and nothing else. It grants no capability over that conference's content,
  no capability over its attendees, and no visibility into any profile — every profile remains behind
  both the shared-registration condition (FR-357) and the owner's discoverability setting (FR-359).
  What the code prevents is a person landing in a conference they have no business being in by
  guessing a URL; it is not what keeps anyone's data private.
- **FR-317b**: Because FR-317a makes the code non-secret, a registration is evidence of **presence,
  not of vetting**. Registration MAY gate *scope* — which conference's content and which attendees a
  person can reach — and that is exactly what 002's event-scoping predicate and FR-357 already do.
  Registration MUST NOT be read as evidence that anyone has checked who the attendee is. No
  requirement, now or later, may treat holding a registration as identity assurance, as an
  entitlement, or as a trust signal.
- **FR-317c**: An attendee MUST be able to withdraw from a conference they have joined, without
  deleting their account. Withdrawing MUST remove the registration and the attendee's per-conference
  state for that conference — saved sessions, notes, and the active-conference selection if it names
  it — and MUST NOT touch their profile, which is cross-event. A registration that can be created by
  entering a public code and never removed would be the one piece of attendee state with no exit,
  which sits badly beside self-serve deletion.
- **FR-317d**: If the withdrawn conference was the active one, the product MUST leave the attendee in
  a coherent state — another registered conference, or the same invitation to join that FR-308
  requires — and MUST NOT present an empty or broken conference.

### Email verification

- **FR-318**: Account creation MUST send a verification message to the address supplied.
- **FR-318a**: **A failure to send MUST NOT fail account creation.** The account is created, the
  person is signed in, and the product states that the message could not be sent and offers to try
  again. Register entry 18 means an unprovisioned or failing mail provider is the *expected* state
  rather than an exceptional one, and coupling account creation to it would make sign-up unusable
  exactly when the provider is missing. The consequence is bounded and acceptable: an attendee whose
  message never arrives is unverified, and FR-359 already withholds discoverability from them.
- **FR-319**: The account MUST record whether its address has been verified.
- **FR-320**: A verification link MUST expire after a stated period and MUST be usable once only.
- **FR-321**: An expired or already-used link MUST be refused with an explanation, and the attendee
  MUST be able to request a new one.
- **FR-322**: Requesting a new verification message MUST be rate-limited.
- **FR-323**: Verification material MUST NOT be readable from storage in a form that allows a link to
  be reconstructed by anyone with database access.
- **FR-324**: An unverified address MUST NOT prevent anything. *Decided 2026-08-07.* The attendee
  signs up and uses the product immediately, including joining a conference, authoring a profile, and
  being discoverable. Verification establishes only that the address can receive mail, which is what
  makes password recovery meaningful.
- **FR-325**: **Verification gates exactly one thing: discoverability.** *Revised at the specification
  review, 2026-08-07.* An unverified attendee uses the product fully — joins conferences, authors a
  profile, saves sessions, writes notes — but **does not appear to other attendees** until their
  address is verified. Everything else remains ungated.
- **FR-325a**: The reason is a compound exposure that neither of the two decisions showed on its own.
  The join code is public (FR-317a), an unverified address otherwise prevents nothing (FR-324), and
  profiles are visible to co-attendees (FR-357). Together those would let anyone sign up **using an
  email address they do not own**, join any conference with a world-readable code, and appear in a
  professional networking directory as that person. Gating discoverability closes that at its only
  consequential exit while leaving the one-sitting journey intact.
- **FR-325b**: The product MUST NOT present an unverified account as impaired, blocked, or pending
  beyond this. It MUST state plainly that verification is what makes the attendee visible to others,
  so the gate is discoverable rather than mysterious, and it MUST NOT obstruct any other action.
- **FR-325c**: The recorded consequence for later features: **006 may assume every profile it can
  read carries a verified address**, because FR-359 makes verification a precondition of being
  readable at all. No later feature may rely on verification state for anything beyond that.

### Password recovery

- **FR-326**: An attendee MUST be able to request a password reset by email address, without a
  session.
- **FR-327**: The response to a reset request MUST be identical whether or not an account exists for
  the address.
- **FR-328**: A reset link MUST expire after a stated period and MUST be usable once only.
- **FR-329**: Issuing a new reset link MUST invalidate any outstanding one for that account.
- **FR-330**: Completing a reset MUST invalidate **every** existing sign-in session for that attendee.
- **FR-331**: Reset requests MUST be rate-limited by both identifier and request source.
- **FR-332**: No message, log, or record may ever contain a password, old or new.
- **FR-333**: Reset material MUST be stored so that database access alone does not permit a link to be
  reconstructed.

### The profile

- **FR-334**: An attendee MUST be able to author a profile carrying company, role, headline,
  interests, networking intent, and availability.
- **FR-335**: An attendee MUST be able to edit every field of their own profile and no field of
  anyone else's.
- **FR-336**: Profile fields MUST be optional except the display name, which already exists and is
  required; an incomplete profile is valid.
- **FR-337**: Every free-text field MUST have a stated length limit, communicated as it is
  approached.
- **FR-338**: A field that is empty or over its limit MUST leave confirmation **disabled** with the
  reason stated, never producing a post-submit error.
- **FR-339**: Networking intent and availability MUST be attendee-authored values; no seed process
  and no other attendee may set them.
- **FR-340**: A profile MUST be readable by its owner regardless of any visibility setting.
- **FR-341**: An empty profile MUST render as an invitation to complete it, not as a failure or a
  broken record.
- **FR-342**: The seeded attendee accounts MUST be given profile data by the seed, so that the
  directory 006 builds is not empty in development.

### The avatar

- **FR-346**: An attendee MUST be able to upload an image as their avatar, replace it, and remove it.
- **FR-347**: Accepted image formats and a maximum size MUST be stated, and an upload violating either
  MUST be refused before any bytes are stored.
- **FR-348**: A stored image MUST be resized to bounded dimensions rather than stored at its uploaded
  resolution.
- **FR-349**: **All embedded metadata MUST be stripped** before storage. What is stored and served
  MUST carry no location, camera, or timestamp information from the original.
- **FR-350**: Replacing an avatar MUST make the previous bytes unretrievable.
- **FR-351**: An attendee with no avatar MUST render with a non-photographic fallback everywhere a
  profile appears; no broken image may appear.
- **FR-352**: Image bytes MUST be read and written only through a project-owned storage interface.
  No feature code may call a storage vendor's API directly, and the interface MUST have an
  implementation that works in development, test, and preview with no external provisioning.
- **FR-353**: The avatar MUST be treated as attendee personal data for the purposes of FR-364–FR-379,
  which is to say it is both deleted with the account and present in the export.
- **FR-354**: The photographs currently used as prototype sample data MUST NOT be shipped as seeded
  attendee avatars.

### Discoverability and visibility

- **FR-357**: An attendee's profile MUST be readable by attendees registered for a conference they are
  also registered for, and by nobody else. Registration gates *scope* here and is not read as identity
  assurance — see FR-317b.
- **FR-358**: The shared-conference condition MUST be evaluated server-side before any profile data is
  returned; client-side filtering MUST NOT be relied on.
- **FR-359**: A profile MUST be readable by another attendee only when **both** conditions hold: the
  owner's discoverability setting is on, **and** the owner's email address is verified (FR-325).
  Either being false makes the profile unreadable by others. The setting is the attendee's choice;
  verification is the product's precondition.
- **FR-360**: Discoverability MUST be all-or-nothing. Per-field visibility MUST NOT be introduced
  without a recorded decision.
- **FR-361**: A refusal MUST be identical whichever of the three causes produced it — no conference in
  common, discoverability off, or address unverified — and none may disclose whether the attendee
  exists. **The requesting attendee MUST NOT be able to learn another attendee's verification state.**
- **FR-362**: The current state of the setting and its effect MUST be stated plainly to its owner.
- **FR-363**: A change to the setting MUST take effect on the next request, without a new sign-in.

### Account deletion

- **FR-364**: An attendee MUST be able to delete their own account without an intermediary.
- **FR-365**: Deletion MUST be **hard**. No tombstone, soft-delete flag, anonymised shell, or retained
  shadow record may remain.
- **FR-366**: Deletion MUST remove every record attributable to that attendee across every feature,
  including profile, avatar bytes, registrations, active-conference selection, saved sessions, notes,
  verification and reset material, and sign-in sessions.
- **FR-367**: Deletion MUST require an explicit confirmation stating that it cannot be undone and
  that no copy is retained.
- **FR-368**: Deletion MUST NOT be reversible by any surface in the product.
- **FR-369**: All of the attendee's sign-in sessions MUST stop working immediately, on every device.
- **FR-370**: **No personal-data table may exist that is neither reached by the deletion cascade nor
  covered by a retention rule.** An automated test MUST fail when a table storing attendee data is
  added without one or the other.
- **FR-371**: Deletion MUST be exercised by an automated test against a real database, asserting
  absence of rows rather than absence of errors.

### Personal-data export

- **FR-373**: An attendee MUST be able to obtain a machine-readable file containing all personal data
  the product holds about them.
- **FR-374**: The export MUST cover every table holding data about the requesting attendee, including
  the avatar.
- **FR-375**: The export MUST contain no data belonging to any other attendee.
- **FR-376**: The export MUST contain no credential material.
- **FR-377**: **A field collected but absent from the export is a defect.** An automated test MUST
  fail when a personal-data field is added without export coverage.
- **FR-378**: Export MUST be bound to the authenticated attendee and MUST refuse any request naming
  another identifier.
- **FR-379**: Export MUST be rate-limited.

### The retention clock

*Corrected during planning, 2026-08-07.* An earlier draft of this section required a retention clock
to be built and assumed a 90-day window. **Both were wrong about the code that already exists.**
`apps/api/src/maintenance.ts` runs an hourly sweep that deletes `sign_in_attempts` older than **two
hours** and `auth_sessions` older than 30 days, and it has been running since 001. Requiring a
90-day window would have *lengthened* retention of pseudonymous personal data forty-fold — a
regression dressed as a requirement. The requirements below are rewritten to protect what exists and
extend it, rather than to rebuild it.

- **FR-381**: Personal-data records that no deletion cascade can reach MUST be removed on a stated
  schedule. **This obligation is already discharged for the records that exist today** by the hourly
  maintenance sweep, and this feature MUST NOT weaken it.
- **FR-382**: The existing two-hour window on `sign_in_attempts` MUST NOT be lengthened. It is tied
  to the throttle's one-hour counting window plus margin, which is the shortest window that keeps
  throttling correct — and the shortest correct window is the right one for a table of keyed hashes
  of every address ever typed at the service, including addresses belonging to people who are not
  attendees.
- **FR-383**: Any record this feature adds that holds personal data and cannot be reached by the
  deletion cascade MUST be added to the same sweep in the same change, with a stated window.
  Purging MUST NOT interfere with the correctness of throttling within the active window.
- **FR-384**: Verification and reset material MUST be removed once expired or used, and MUST NOT
  accumulate. These records *are* cascade-reachable, being attributable to one attendee, so the
  sweep is a second line rather than the only one.

### Identity scoping and server-side authorization

- **FR-385**: Every route this feature adds that reads or writes attendee data MUST derive identity
  from the sign-in session and MUST NOT trust an attendee identifier supplied by the client.
- **FR-386**: Every such route MUST refuse an unauthenticated caller.
- **FR-387**: The unauthenticated routes this feature necessarily adds — sign-up, verification, reset
  request, reset completion — MUST be enumerable, and each MUST be rate-limited.
- **FR-388**: Refusals MUST disclose nothing about the existence of an account, a profile, a
  conference, or a join code.
- **FR-389**: Cross-attendee isolation MUST be asserted by automated tests exercising the server
  directly with real seeded rows, not by tests of client behaviour.
- **FR-390**: A profile read for another attendee MUST evaluate both the shared-conference condition
  and the discoverability condition server-side before returning any field.
- **FR-391**: No route added here may return credential material, verification material, or reset
  material under any circumstance.

### Structural preparation

- **FR-393**: The storage interface introduced by FR-352 MUST take its place alongside the existing
  device-capability interfaces, so that later features reach durable binary content the same way.
- **FR-394**: Transactional account mail MUST be sent through a project-owned interface, so that no
  feature code calls a mail vendor directly and so that test and preview do not send real mail.
- **FR-395**: The mail interface MUST NOT be usable for engagement notifications; that exclusion
  stands until a recorded decision lifts it.
- **FR-396**: This feature MUST emit exactly one migration, numbered `0003`, per the Context note
  above.

### Key Entities

- **Attendee** — extended, not replaced. Gains verification state and a discoverability setting
  alongside the existing identity and display name. Cross-event: an account is one person across every
  conference.
- **Attendee profile** — company, role, headline, interests, networking intent, availability.
  Attendee-authored. **Cross-event**, because it describes the person rather than their presence at
  one conference; it is *read* per conference through the shared-registration condition, which is a
  visibility rule rather than a scoping rule.
- **Avatar** — bounded, metadata-stripped image bytes belonging to exactly one attendee. Cross-event,
  for the same reason as the profile.
- **Conference join code** — a value on the seeded conference record. Not attendee data; never
  written by the product.
- **Verification and reset material** — short-lived, single-use, attributable to one attendee, removed
  on use or expiry.
- **Registration** — unchanged. Already the per-conference join between attendee and conference.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-300**: A person with no prior account can go from arriving to seeing their conference's Home
  in under three minutes, without help from anyone.
- **SC-301**: A person **who has verified their address** and has forgotten their password can regain
  access to their account unaided. Scoped deliberately: FR-324 permits an account to remain
  unverified indefinitely, and such an account is unrecoverable by construction — which is the stated
  cost of not verifying, not a failure of this criterion.
- **SC-302**: 100% of attendee-authored profile fields survive a reload and appear identically on a
  second device.
- **SC-303**: An uploaded photograph carries no location, camera, or timestamp metadata once stored —
  verified by inspecting stored bytes, not by trusting the upload path.
- **SC-304**: An attendee who turns discoverability off, **or who has not verified their address**,
  cannot be retrieved by any other attendee through any surface — verified server-side, and refused
  identically in both cases so neither state is observable from outside.
- **SC-304a**: A person cannot cause an email address they do not control to appear in any
  conference's directory.
- **SC-305**: An export contains 100% of the fields the product stores about the requesting attendee,
  verified by a test that fails when a field is added without export coverage.
- **SC-306**: After account deletion, zero rows attributable to that attendee remain in any table,
  verified by direct database assertion.
- **SC-307**: Every route this feature adds refuses both an unauthenticated caller and a caller
  presenting another attendee's identifier — 100% of routes, verified against the running server.
- **SC-308**: Records that no cascade can reach are absent once past the stated retention window.
- **SC-309**: No content or primary action introduced by this feature requires horizontal scrolling at
  320px.
- **SC-310**: Every control introduced has an accessible label, a visible focus state, and keyboard
  operability.
- **SC-311**: No credential, verification, or reset material appears in any response, log, or export.

### Constitution validation checklist — items this feature discharges

From the whole-product validation checklist in `requirements.md`:

- **Keyboard focus visibility and accessible labels** — discharged for every control introduced here.
- **Production build success** — maintained.
- **Desktop and mobile rendering** — extended to the sign-up, join, profile, and account surfaces.
  Explicitly *not* client-validated; see Open Questions.

Deliberately left to later features: attendee search and filter (006), card-sharing feedback and
meeting scheduling (008), message composition (007), audience Q&A (009). **Navigation and event
switching** and **session save + notes** were discharged by 002 and 005 and are unaffected.

---

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Offline behaviour** (Principle VI) | **Works offline**: the installed shell and navigation, as 001 established, and the cached agenda surfaces 005 introduced, unchanged. **Does not work offline**: every surface this feature adds. Sign-up, joining a conference, verification, password reset, profile editing, avatar upload, discoverability changes, export, and deletion all require a connection, and each says so explicitly and distinguishes "you are offline" from "this is a problem on our side". **An action attempted offline** is refused with an explanation, leaves displayed state unchanged, and is **never queued and never shown as having succeeded** — consistent with 005, which established that writes are refused rather than queued. Typed profile text and a selected image file remain on screen so nothing the attendee entered is lost. **Nothing this feature stores is cached for offline reading.** The attendee's own profile is deliberately *not* added to 005's cache: it is small, it is only meaningful when editable, and caching it would create a second copy of personal data on the device for no offline capability worth having. **No write queue, optimistic update, or conflict merging is introduced.** |
| **Desktop layout** (Principle IV) | Sign-up, join, verification and reset render outside the authenticated shell, alongside the existing sign-in screen and following its established composition. Inside the shell the persistent left rail and top bar are unchanged; the profile renders as a single-column form within the multi-column workspace, with the account actions — discoverability, export, deletion — grouped below it and visually separated from ordinary editing. |
| **Tablet layout** (Principle IV) | Reduced rail unchanged. The profile form keeps a single column; the account actions stack beneath it. Unauthenticated surfaces are centred as at desktop with a narrower measure. |
| **Mobile layout** (Principle IV) | Compact header and bottom navigation unchanged. Every form is a single column with touch-sized controls and no horizontal scrolling at 320px. The delete-account confirmation is a **full-width overlay** with a clear close control and Escape dismissal. Image selection uses a touch-sized control that does not crowd the surrounding fields. |
| **Empty / loading / failure states** (Principle IV) | **Sign-up**: submitting, failure, and a rejection that discloses nothing. **Join code**: submitting, unrecognised, already registered, failure. **Withdrawing from a conference**: confirming — stating that the conference's saved sessions and notes go with it (FR-317c) — withdrawing, failure. **No conference joined**: an invitation to join, not an empty conference. **Verification**: pending — stating that verification is what makes the attendee visible to others — verified, link expired, resend sent, **message could not be sent** (FR-318a, distinct from a rejected address), failure. **Reset**: request submitted (identical whether or not the account exists), link expired, password set, failure. **Profile**: loading, empty-and-invited, saving, saved, failure. **Avatar**: no avatar (fallback), uploading, rejected for size or type, upload failed, removed. **Discoverability**: current state, saving, failure. **Export**: preparing, ready, failure. **Deletion**: confirming, deleting, failure. Every failure distinguishes offline from a server fault. |
| **Accessibility** (Principle IV) | Every control introduced has an accessible label, a visible focus state, and keyboard operability. Disabled confirmations state *why* they are disabled, so the reason is available to a screen reader rather than implied by a greyed control. The delete-account confirmation dismisses on Escape, confines focus while open, offers a visible labelled close control, and returns focus to its opener — the same treatment 005 established for the session panel. Verification and discoverability states are announced, never conveyed by colour alone. Password requirements are associated with the field rather than presented as adjacent prose. |
| **Validation checklist discharged** (Principle VII) | Keyboard focus visibility and accessible labels for every control introduced; production build; desktop and mobile rendering extended to the sign-up, join, profile and account surfaces. Left to later features: attendee search and filter; card-sharing feedback; meeting scheduling and appointment creation; message composition; audience Q&A with upvoting. |
| **Identity scoping & server-side authorization** (Principle VIII) | Applies to every surface here, and this feature adds the product's **first deliberately unauthenticated write routes**. **Rule**: authenticated routes derive identity from the sign-in session and never from a client-supplied identifier; a profile read for another attendee additionally requires **three** conditions, all evaluated server-side — a shared conference registration, that attendee's discoverability setting, and that attendee's address being verified (FR-359). A refusal is identical whichever condition failed, so verification state is never observable from outside (FR-361). **Registration gates scope and is never read as identity assurance** (FR-317b), which matters because the join code is public by decision. **Enforcement**: refusal by default; refusals that disclose nothing about existence; cross-attendee isolation asserted by tests exercising the server directly against real seeded rows. **The unauthenticated routes are enumerable and each is rate-limited** by the same defence protecting sign-in — sign-up, verification, reset request, reset completion. **New personal data stored**: profile fields, avatar image bytes, verification state, and short-lived verification and reset material. |
| **Deletion & export coverage** (Principle VIII, added v2.3.0) | **This feature both discharges and defines the obligation.** Deletion is self-serve, hard, and cascading: profile, avatar bytes, registrations, active-conference selection, verification state, verification and reset material, sign-in sessions — and, transitively, the saved sessions and notes 005 already made cascade-reachable. **No tombstone.** Export is self-serve and machine-readable and covers every field named above except credential material, which is excluded by FR-376. **The one record no cascade can reach is `sign_in_attempts`**, which has no foreign key by design; it is covered by the retention clock (FR-381–FR-383) rather than by deletion. **Two structural guards are required rather than recommended**: a test that fails when a personal-data table is added with neither cascade nor retention rule (FR-370), and a test that fails when a field is collected without export coverage (FR-377). The retention window itself is an assumption below, open to challenge at the review gate. |
| **Event scoping** (Constraints — data scoping) | **Attendee profile — cross-event.** A profile describes the person, not their presence at one conference; a networking product where a professional identity resets per conference is not what `requirements.md` describes, and the hybrid rule places relationships and person-level data on the cross-event side. **Avatar — cross-event**, for the same reason. **Verification and reset material — cross-event**, being properties of the account. **Discoverability — cross-event**, deliberately: a single setting rather than one per conference, because per-conference discoverability is per-field visibility's cousin and was rejected on the same grounds. **Verification state — cross-event**, being a property of the address rather than of any conference, and now load-bearing for visibility (FR-359). *Recorded consequence*: profiles are cross-event data **read** through a per-event condition. That is a visibility rule, not a scoping rule, and FR-357–FR-361 state it as such so a later feature does not mistake it for one. **No existing table's scoping changes.** |
| **Register position** (Governance) | Assessed against constitution **v2.3.0**. **Resolved before this feature, by the amendment that unblocked it**: entries **5** (identity model), **6** (retention, deletion, export) and **13** (avatar handling). This feature *implements* those decisions; it does not resolve the entries, which are already closed. **Blocks this feature**: none. **Touched but not blocking**: **entry 11** — the object-storage provider, which FR-352 keeps off the critical path by requiring an implementation that needs no provisioning; **entry 18** — the transactional email provider, which FR-394 handles the same way, though unlike storage, mail that sends nothing real makes verification and recovery unprovable in production; **entry 19** — nobody moderates uploaded avatar images, which this feature *creates the exposure for* and does not resolve. See Dependencies. **Escalated by this feature**: **entry 4**, client validation of desktop and tablet layouts, now extended to the product's first unauthenticated surfaces beyond sign-in; and **entry 16**, the repository being public, which bears directly on the join code and is
**accepted rather than worked around** — FR-317a records the code as non-secret and states why that
is safe. **Remaining open and unchanged**: entry 17's preview path, entries 1–3, 7–10, 12, 14, 15. |
| **Reserved migration number** (Branching — parallel work) | **`0003`**, as reserved by the delivery roadmap for phase 004, and **exactly one migration**. `0004` is spent by 005 and `0005`–`0007` are reserved by 006–008, so there is no free adjacent number; the reasoning is recorded in the Context note. If implementation proves a split is necessary, the reservations for 007 and 008 MUST be renumbered in the same change rather than this feature taking a number another phase holds. Per Principle VII, `0003` MUST be verified in CI — applied forward against a real database, with the integration suite run against the result — before it reaches any environment holding real data. |

---

## Assumptions

Reasonable defaults taken where brainstorm #04 did not decide, recorded so the review gate can
challenge them.

- **The retention window for sign-in attempts stays at the existing two hours.** *Revised during
  planning* — an earlier draft assumed 90 days and assumed nothing swept. The sweep exists and has
  since 001; two hours is the throttle's counting window plus margin, and lengthening it would
  retain pseudonymous personal data for no purpose any requirement names.
- **Verification and reset links expire in 24 hours and 1 hour respectively.** A verification link is
  followed at leisure; a reset link is a live credential and should be short.
- **Deleting an account frees its email address for re-registration.** Hard deletion plus a unique
  constraint means it does, and the alternative — retaining the address to prevent reuse — would be a
  tombstone by another name, which FR-365 forbids.
- **A re-registered address starts an entirely new account**, inheriting nothing from the deleted one.
- **Upload uses the platform's file selection**, which on mobile already offers the camera. The
  `CameraService` interface is **not** wired for direct capture in this feature; doing so would add a
  second capture path for no capability the file input does not already provide. Recorded as an open
  question rather than a closed one.
- **Avatars are stored at a single bounded size**, not at multiple resolutions. Multiple sizes are a
  performance optimisation that can be added without changing the interface, and guessing at
  breakpoints before Discover exists would be speculative.
- **Interests are a bounded list of short free-text values**, not a controlled vocabulary. A fixed
  taxonomy is an organizer-authored artifact, and Principle III puts that out of scope.
- **Networking intent and availability are chosen from stated options** rather than free text, since
  `requirements.md` describes them as states ("Open to meetings", available / busy) that 006 filters
  on.
- **The export is a single file**, generated on request rather than assembled asynchronously. At
  conference scale one attendee's data is small; an asynchronous job with its own delivery path would
  be more machinery than the obligation needs.
- **Discoverability defaults to on** for a new account. A networking product where everyone is
  invisible by default does not function, and the setting is presented plainly at sign-up and on the
  profile so the default is visible rather than silent. **The default is safe because it is not
  sufficient**: FR-359 also requires a verified address, so an account defaulted to discoverable still
  appears to nobody until its owner proves they can receive mail at it.
- **The seed continues to run only against local development and per-PR preview environments**, never
  against an environment holding real attendee data.

---

## Dependencies

- **001 Production Foundation**, merged: authentication, credential storage, sign-in sessions,
  identity binding at the request boundary, the sign-in throttle this feature extends to four new
  unauthenticated routes, the responsive shell, the repository interface layer, and the theme tokens.
- **002 Event Context, Session Catalog & Home Composition**, merged: `registrations`, the active
  conference selection, and the server-side conference-scoping predicate that FR-357 reuses.
- **005 Agenda and Saved Sessions**, merged: the saved-session and note tables whose existing
  `ON DELETE CASCADE` this feature finally makes reachable, and the modal treatment the
  delete-account confirmation follows.
- **A transactional mail provider must be chosen and provisioned before verification and recovery
  work in production** — register entry 18. FR-394 keeps the feature buildable and testable without
  one, but unlike storage, **an unprovisioned mail path means US2 cannot be proven in production**.
  This is the one dependency capable of making a shipped surface non-functional rather than merely
  unproven.
- **An object-storage provider is *not* a dependency for building or testing this feature** — entry 11
  — because FR-352 requires an implementation that works without provisioning. It is a dependency for
  production.
- **Register entry 19 — nobody moderates uploaded avatar images — is opened by this feature and not
  closed by it.** Public self sign-up plus image upload, with no administrative actor by construction,
  means the product will accept any image any person uploads and show it to co-attendees. The
  organizer exclusion forecloses the usual answer. This does not block the specification, and it
  **should be settled before the first publicly reachable deployment**.
- **The preview path remains unprovisioned** — register entry 17's remaining half. The correctness
  gates all run; `db-branch`, `schema-diff`, `deploy-api` and `deploy-preview` do not, so the
  aggregate `verify` check stays red. This feature's guarantees are enforced by gates that **do** run.

---

## Out of Scope

- **The Discover directory** — 006, which reads the profiles this feature authors.
- **Messages, contacts, exchanged cards and appointments** — 007 and 008.
- **Any administrative interface, privileged role, or content import path.** No attendee gains any
  capability over another attendee or over any conference.
- **Creating, editing or revoking a conference join code** through any product surface.
- **Engagement notifications of any kind**, including the prototype's notification bell. Only
  transactional account mail — verification and reset — is in scope.
- **Calendar integration.**
- **Per-field profile visibility.** Considered in brainstorm #04 and rejected; reopening it needs a
  recorded decision.
- **Blocking, reporting, or muting another attendee.** No relationship model exists yet; the
  connection model is a register entry that blocks 008.
- **Moderation of uploaded images.** The exposure is recorded, not addressed.
- **Multiple avatar resolutions, image cropping, and filters.**
- **Changing the email address on an existing account.** The address is the account's identity and
  this feature provides no path to change it. Recorded as a limit rather than omitted: an attendee who
  needs a different address must delete and re-register, which FR-364 and FR-303 both permit.
- **Social or federated sign-in.** Authentication ownership is register entry 12 and remains open.
- **Multi-factor authentication.**
- **Caching any of this feature's data for offline reading.**
- **An administrative or bulk path to delete or export another attendee's data.**

---

## Open Questions

Recorded rather than resolved, per Principle I.

1. **Which jurisdiction's data-protection regime applies.** Deliberately not a blocker: the deletion,
   export and retention requirements are built to the strict standard precisely so that settling this
   is not a precondition. It bears on the retention window and on any lawful-basis wording, not on
   whether the capability exists.
2. **The transactional email provider** — register entry 18. FR-394 keeps the feature testable
   without one, but verification and recovery cannot be proven in production until it is chosen.
3. **Nobody moderates uploaded avatar images** — register entry 19, opened by this feature. Should be
   settled before the first publicly reachable deployment.
4. **Client validation of desktop and tablet layouts** — open since 001 and escalated again here,
   now covering the product's first unauthenticated surfaces beyond sign-in.
5. **Whether verification gating discoverability is enough.** The review narrowed FR-324 so that an
   unverified attendee cannot appear in a directory, which closes impersonation at its consequential
   exit. It does not stop someone signing up under an address they do not own and using the product
   privately, and it does not stop a person using a disposable address they *do* control. Both are
   judged acceptable for a conference networking product; neither is judged solved.
6. **Whether `CameraService` should be wired for direct capture.** This feature assumes the platform
   file input suffices, which on mobile already offers the camera. If a dedicated capture flow is
   wanted, the interface exists and is unused.
7. **Whether 24 hours and 1 hour are the right lifetimes** for verification and reset links. The
   sign-in-attempt window is no longer open: it is two hours, it already exists, and FR-382 forbids
   lengthening it.
8. **Where the account surfaces belong in the shell's navigation.** The profile, discoverability,
   export and deletion actions are not a sixth destination, and exactly where they hang off the
   existing five is a presentation question better answered against the built shell.
9. **Hard deletion gets harder in 007 and 009.** Notes and saved sessions are private, so cascading
   them is clean. A deleted attendee's *messages* sit in another attendee's thread, and their
   *audience questions* sit on a session other people upvoted. FR-365 forbids a tombstone, so those
   phases will have to decide what a conversation with a deleted participant looks like. Settling the
   shape now, while the only affected data is the attendee's own, is easier than settling it later.
10. **Whether the join code should become a secret later.** FR-317a decides it is not one, and states
   why that is safe today: it grants registration and nothing else. If a future feature ever makes
   registration itself confer access to something private, that reasoning stops holding and this must
   be revisited — FR-317b exists to make such a change visible rather than silent.
11. **What "PS" denotes** in the repository name — unchanged by this feature and still open.
