# Brainstorm: Attendee Identity, Personal Data and Profile

**Date:** 2026-08-07
**Status:** active
**Phase:** 004 · migration `0003` reserved · no parallel partner

## Problem Framing

004 is the only phase in the queue blocked on decisions rather than on predecessors. Three register
entries name it: the **attendee identity model** (entry 5, client), **data retention, deletion and
export obligations** (entry 6, client), and **attendee avatar handling** (entry 13, owner). 005 was
sequenced ahead of it precisely because those entries had no answer, and 006, 007 and 008 all list
004 as a dependency — so the block is not local. Four of the eight remaining phases wait behind it.

This session was convened to answer all three. The project owner confirmed at the outset that he
speaks for the client on entries 5 and 6, so the decisions below are binding rather than provisional.

Three things narrowed the space before any option was proposed.

**Two of the four candidate identity models were never available.** Entry 5 lists self sign-up,
event invitation, ticket holder and organizer-provisioned. But Principle III puts organizer
administration out of scope, and the standing decision on content provenance adds that seed data
"must not become a route around the organizer exclusion — no admin interface, no privileged role, no
content import path." *Event invitation* and *organizer-provisioned* both require an issuer who is
not an actor in this system. *Ticket holder* requires an external ticketing integration that nobody
has decided on. The register presented four options; the constitution had already eliminated three.

**The identity question is also the recovery question.** `attendee_credentials` carries no recovery
token, no security question and no password history, and the schema comment says why: "there is no
recovery flow in this slice, and spec Open Question 1 — the attendee identity model — has to be
settled by the client before one can be designed." Whatever is decided here decides whether a person
who forgets their password is locked out permanently.

**005's cascade has nothing to trigger it.** 005 shipped `ON DELETE CASCADE` on notes and saved
sessions and asserted it in an integration test, on a declared commitment that personal content is
"deleted with the account". There is no delete-account route anywhere in `apps/api`. The guarantee is
structurally sound and operationally unreachable — it describes what *would* happen if an account
were ever deleted, and no path exists by which one could be.

## Approaches Considered

Six decisions, each taken against explicit alternatives.

### 1. How a person becomes an attendee

**A: Self sign-up plus an event join code, staged.** The model is decided now; 004 ships profile
editing only, against the seeded roster, and the sign-up surface becomes a later phase.
- Pros: keeps 004 near its roadmap scope; the model closes entry 5 immediately.
- Cons: the recovery gap stays open through every intervening phase; the profile feature ships for
  a population that cannot grow.

**B: Self sign-up plus an event join code, entirely within 004.** *(chosen)* Anyone creates an
account with email, display name and password, and registers for a conference by entering an access
code carried on the seeded event row. 004 covers the whole account lifecycle.
- Pros: no issuer and no privileged role, so the attendee remains the only actor and the organizer
  exclusion holds exactly; closes the recovery gap in the same phase that opens the sign-up path
  that makes it urgent; `registrations` and the event-scoping guard already exist to receive it.
- Cons: departs substantially from the roadmap's scope for this phase; reaches into authentication
  code that 001 owns, which the phase-parallelism analysis did not anticipate.

**C: Seeded roster, permanently.** No sign-up ever; accounts and registrations ship as seed data,
exactly as the code stands today.
- Pros: zero new surface, and the cleanest possible reading of the organizer exclusion.
- Cons: account creation moves entirely outside the system, which is organizer administration
  performed elsewhere rather than avoided; a forgotten password becomes a permanent lockout.

### 2. Transactional email against the notification exclusion

Choosing B made this unavoidable: verification and password reset both send mail, and `CLAUDE.md`
holds that "notification delivery… stays out until a recorded decision brings them in — their
interfaces exist but must not be wired to real delivery." Whether that exclusion covers transactional
account mail or only the notification bell was genuinely undecided.

**A: Transactional email is in scope.** *(chosen)* The exclusion is recorded as covering engagement
notifications — the bell, pushes, digests — and not transactional account mail. 004 wires a real
provider for verification and reset only.
- Pros: verification and recovery actually work; the boundary is stated rather than inferred.
- Cons: one external dependency and one secret, in a phase already carrying several.

**B: No email at all.** Sign-up without verification, recovery out of 004 entirely.
- Cons: removes the main reason for choosing B in decision 1.

**C: An `EmailService` interface wired to a dev-only sink.** Flows work end to end in test and
preview and send nothing real.
- Cons: the real path stays unproven; deferred provisioning rather than a decision.

### 3. Retention, deletion and export

Choosing self sign-up changed this question's character. With no organizer and no admin actor,
"request deletion through support" no longer resolves to anybody.

`sign_in_attempts` turned out to be the hard case. It stores keyed hashes of the email and the
request source with **no foreign key to `attendees`, deliberately** — an attempt against an address
belonging to nobody must still be recorded, or address enumeration is invisible. It is therefore
pseudonymous rather than anonymous, since the key exists, and it is the one personal-data table that
**cannot** be reached by a deletion cascade. Only a clock can clear it, and nothing runs one.

**A: Full self-serve — deletion, export and a retention clock.** *(chosen)* Self-serve account
deletion that hard-deletes and cascades everything attendee-authored, with no soft delete and no
tombstone; self-serve export of all personal data in a machine-readable file; and a declared
retention clock that purges sign-in attempts after a fixed window.
- Pros: satisfies access, erasure and portability without first settling which jurisdiction applies,
  which removes that as a future blocker rather than deferring it; gives 005's cascade something to
  trigger it; covers the one table a cascade cannot reach.
- Cons: the largest of the three options, in the largest phase in the queue.

**B: Deletion and the clock now, export deferred** with its absence recorded, which Principle VIII
explicitly permits.
- Cons: portability becomes a known gap that reopens the moment jurisdiction is settled as EU.

**C: Extend 005's narrow commitment** — deleted with the account, no export, no clock.
- Cons: with self sign-up there is no actor who could action an out-of-band deletion request, so the
  commitment would remain untriggerable exactly as it is today.

### 4. Avatar handling

Self sign-up changed this one too: a person who signs themselves up has no seeded image, so seeded
imagery stopped being a complete answer. Recorded alongside: the prototype's avatars are Unsplash
photographs of **real people** used as sample data, and shipping them as seeded attendee faces in a
real product with a public repository attributes real likenesses to fictional attendees.

**A: Generated initials, no upload.** Derived deterministically from the display name.
- Pros: no object storage, no `CameraService`, no third-party image requests, nothing new to retain
  or export; retires the Unsplash photographs.
- Cons: no real photographs, in a product whose whole purpose is people recognising each other.

**B: Real upload.** *(chosen)*
- Pros: the networking product shows real faces, which is the point of a networking product.
- Cons: pulls in object storage, `CameraService`, resizing and EXIF stripping — phone photographs
  carry GPS coordinates, so an unstripped upload publishes where it was taken; adds a personal-data
  surface that both the deletion cascade and the export file must now cover; nobody moderates it.

**C: Generated now, upload as a later phase.** Same code as A, with upload kept as a planned
commitment rather than closed out.

### 5. Where uploaded images live

Choosing B above risked unblocking 004 by creating a fresh block on it: register entry 11 (API
hosting and the managed PostgreSQL provider) is open, and object storage would normally be decided
with it.

**A: In PostgreSQL, as bytes.** No new infrastructure; deletion cascades and export come free.
- Cons: an unusual shape that would likely be migrated later.

**B: Object storage behind a platform interface.** *(chosen)* A `StorageService` joins the six
existing device-capability interfaces, with a filesystem- or database-backed implementation for
development, test and preview. The real provider is deferred to the same decision as entry 11.
- Pros: matches the abstraction discipline the constitution already mandates and 001 already
  established; 004 is testable end to end without any provisioning; the eventual provider swap
  touches one implementation.
- Cons: more code now, and the production path stays unproven until provisioning lands — which is a
  known gap rather than a hidden one.

**C: Pick the provider now** — Cloudflare R2, since Cloudflare is already in the stack for Pages.
- Cons: entangles 004 with entry 11 and needs credentials before anything can be tested.

### 6. Profile visibility

Left unanswered, this would have landed on 006, which consumes profiles rather than authoring them.
Principle VIII says private content stays private and that any exception needs a recorded client
decision — so co-attendees seeing a profile *is* such an exception, and it is a data-model question
belonging to the phase that builds the model.

**A: Visible to co-attendees, with a discoverability toggle.** *(chosen)* The profile is visible to
attendees registered for the same event, matching the hybrid event-scoping rule, and one switch
removes the attendee from Discover entirely.
- Pros: enforceable server-side by the predicate that already exists; a real opt-out without a
  per-field permissions model.
- Cons: an all-or-nothing opt-out may prove too blunt.

**B: Visible to co-attendees, no toggle.**
- Cons: no way to withdraw short of deleting the account, which sits badly beside decision 3.

**C: Per-field visibility.**
- Cons: considerably more model, UI and server-side enforcement, in a phase already well oversized.

## Decision

All three blocking register entries are **resolved**, and three consequential decisions are recorded
with them.

1. **Identity model — self sign-up with an event join code, delivered entirely within 004.** A person
   creates their own account and registers for a conference with a code carried on the seeded event.
   No issuer, no privileged role, no import path; the attendee remains the only actor. *Closes
   register entry 5.*
2. **Transactional account mail is in scope**, and is distinguished from notification delivery, which
   stays excluded. The notification bell remains forbidden.
3. **Retention, deletion and export — full self-serve.** Hard deletion with cascade, machine-readable
   export, and a retention clock for the one table a cascade cannot reach. *Closes register entry 6.*
4. **Avatars — real upload**, with resizing and EXIF stripping mandatory rather than optional.
   *Closes register entry 13.*
5. **Image bytes live behind a `StorageService` platform interface**, with a local implementation for
   development, test and preview, and the real provider deferred into entry 11.
6. **Profile visibility — co-attendees at the same event, with a single discoverability toggle.**

**004 departs from the roadmap and its specification must say so.** The roadmap scopes this phase as
"extend the attendee with company, role, interests, networking intent, availability, headline,
avatar" plus an own-profile edit surface, and treats the identity model as an *input* to it. As
decided, 004 also carries sign-up, event join, email verification, password recovery, a transactional
email provider, avatar upload with a new platform interface, account deletion, personal-data export,
a retention purge, and a discoverability toggle. That is four or five features under one number, and
the single reserved migration `0003` is unlikely to be sufficient.

**A phase split is the first thing to settle once the specification exists.** This is recorded as an
agreed consequence, not an objection to reopen — the scope was chosen deliberately, to close the
recovery gap in the same phase that opens the sign-up path making it urgent.

## Key Requirements

Carried into `/speckit-specify` as the substance of the phase.

- Sign-up collects email, display name and password; email is already globally unique in the schema,
  which is what makes one account work across every conference.
- Event registration happens by entering an access code carried on the seeded event row, writing a
  row to the existing `registrations` table.
- Email verification and password reset both send real transactional mail. Neither may reuse or
  extend the notification surface.
- Account deletion is self-serve, hard, and cascades every attendee-authored record. No soft delete,
  no tombstone row.
- Personal-data export is self-serve and machine-readable, and must cover every table that holds
  attendee data — including the avatar.
- Sign-in attempts are purged on a clock, because no cascade can reach them.
- Avatar upload resizes and strips EXIF before storage. GPS coordinates in phone photographs are the
  specific hazard.
- Avatar bytes go through a `StorageService` interface alongside the six existing device
  capabilities; no application code touches a storage SDK.
- A profile is visible to attendees registered for the same event, enforced server-side by the
  existing `EventScope` predicate, and a discoverability toggle removes the attendee from Discover.
- Profile validation is **disabled confirmation**, never a post-submit error, per `requirements.md`.

## Open Questions

Recorded rather than resolved. None blocks the specification.

- **Which jurisdiction's data-protection regime applies.** Decision 3 deliberately builds to the
  strict standard so this does not gate 004, but the retention *window* and any lawful-basis wording
  depend on it.
- **The transactional email provider.** A new owner/planning decision, and a new register entry —
  decision 2 settles that mail is sent, not by whom.
- **The object storage provider**, which folds into existing entry 11 rather than opening a new one.
- **How long sign-in attempts are retained** before the purge removes them.
- **Nobody moderates uploaded images.** Public sign-up plus image upload with no admin actor and no
  moderation surface is a real exposure, and the organizer exclusion is what prevents the usual
  answer. Worth settling before the first public preview, not after.
- **Sign-up is an unauthenticated write endpoint**, and the existing throttle covers sign-in only.
- **The event join code would be world-readable.** The repository is public and the code would live
  in committed seed data, so anyone who reads the repository could join any conference. Whether the
  code moves out of the seed, is generated at deploy time, or is simply accepted as non-secret needs
  an answer.
- **Whether deleting an account frees its email address for re-registration.** Hard deletion plus a
  globally unique email means it does, which is probably right and is currently unstated.
- **Hard deletion gets harder in 007 and 009.** Notes and saved sessions are private, so cascading
  them is clean. A deleted attendee's messages sit in someone else's thread, and their audience
  questions sit on a session other people upvoted. The commitment made here is easy to honour today
  and will need a real answer in those phases — which is an argument for settling it now, while the
  only affected data is the attendee's own.
- **Whether `CameraService` is wired for direct capture**, or whether upload is file-picker only with
  the platform handling camera access.
- **How 004 splits into reviewable phases**, given its size.
