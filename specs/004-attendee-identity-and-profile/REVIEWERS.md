# Review Guide: Attendee Identity, Personal Data and Profile

**Generated**: 2026-08-07 | **Spec**: [spec.md](spec.md) | **Constitution**: v2.3.0

> **Read this first — four things will look wrong if you review them against the wrong document.**
>
> 1. **This feature departs from the delivery roadmap further than any phase before it.** The roadmap
>    scopes 004 as *"extend the attendee with company, role, interests… own-profile view and edit"*
>    and treats the identity model as an **input**. This feature *delivers* the identity model and
>    the whole account lifecycle around it. The departure is stated in the spec's *Departure* table;
>    **whether it is the right call is a reviewer question**, and the alternative that was rejected
>    is recorded.
> 2. **Sign-up deliberately tells you an address is already registered.** That is not an oversight.
>    Non-disclosure is unachievable alongside auto-sign-in, and a requirement demanding it would have
>    been satisfied on paper and defeated in practice. See *Key Decisions 2*.
> 3. **The conference join code ships in committed seed data, in a public repository.** Also
>    deliberate. See *Key Decisions 1* for why that is safe, and *Areas Needing Attention* for the
>    condition under which it stops being safe.
> 4. **This feature opens a register entry it does not close** — nobody moderates uploaded avatar
>    images (entry 19). Do not approve a public deployment without reading *Areas Needing Attention*.

## Why This Change

Every attendee who exists today was put there by a seed script. `apps/api/src/routes/auth/` carries
`sign-in`, `sign-out` and `me`, and nothing else — there is **no way to create an account, no way to
recover one, and no way to delete one**. The company, role, interests, networking intent and
availability that `requirements.md` describes are nowhere in the schema.

004 has been blocked since the roadmap was written, on three register entries. Two features were
resequenced around it. Constitution v2.3.0 closed all three on 2026-08-07, and this is the feature
that acts on them.

There is a sharper reason than "the roadmap says so". 005 shipped an `ON DELETE CASCADE` over notes
and saved sessions, asserted by an integration test, on a declared commitment that personal content
is *deleted with the account*. **That guarantee has been operationally unreachable since the day it
shipped**, because nothing in the product can delete an account. This feature is what finally gives
it something to fire.

## What Changes

A person creates their own account, joins a conference with a code, verifies their address, and
recovers a forgotten password. They author a profile with a photograph, choose whether other
attendees can find them, take a complete machine-readable copy of everything the product holds about
them, withdraw from a conference, and delete their account outright.

**Breaking-ish**: nothing shipped changes behaviour, but `sign_in_attempts` gains a column and its
indexes are rebuilt, and `events` gains a `NOT NULL` column — so **a migrated but unseeded database
has no joinable conferences**.

## How It Works

Six new tables, three altered, one migration (`0003` — the only free number). Two new server-side
ports: `StorageService` for avatar bytes and `MailService` for transactional account mail, each with
a local adapter needing no provisioning, so neither unprovisioned vendor blocks the feature.

**Authorization reuses 002's machinery rather than inventing any.** A profile read for another
attendee is `GET /events/:eventId/attendees/:attendeeId`, carrying `requireEventAccess` — so the
*reader's* registration is proven by the branded `EventScope` that only that module can construct,
and the route audit fails the build if the guard is ever dropped. The *target's* three conditions —
registered for the same conference, discoverable, verified — are **one `WHERE` over one join**, so
all four refusal causes produce no row and are indistinguishable *by construction* rather than by
four careful call sites. That is exactly how 002 obtained the same property for events.

**Deletion is mostly one row.** Ten tables already cascade from `attendees`. The interesting case is
the one record no foreign key can reach — the avatar's bytes — which is why the ordering is specified:
object first, then row, so a failure orphans a row pointing at missing bytes (recoverable, renders
the fallback) rather than bytes no row references (unreachable, invisible to any audit).

## When It Applies

**Applies when**: a person has no account; an attendee wants to join, leave, describe themselves,
control their visibility, export their data, or close their account; or any later feature adds a
table holding attendee data — the two structural guards apply to it automatically.

**Does not apply when**: reading conference content (untouched), the agenda (untouched), or Home
(no card added, none edited). **Offline: nothing this feature adds works offline**, declared
explicitly rather than discovered — every action is refused with an explanation, and nothing is
queued.

## Key Decisions

1. **The join code is not a secret** (FR-317a). Real codes ship in committed seed, in a public
   repository. *Alternatives*: keep codes out of seed and supply per environment; generate at deploy
   time. *Why*: possessing a code grants registration and nothing else — every profile stays behind
   both a shared registration and the owner's discoverability. The code stops someone landing in a
   conference by guessing a URL; it is not what keeps anyone's data private. FR-317b exists to make
   any future reliance on registration-as-trust visible rather than silent.

2. **Sign-up discloses that an address is registered** (FR-303). *Alternative*: identical responses
   either way, dropping auto-sign-in. *Why*: with auto-sign-in the outcomes are distinguishable
   whatever the wording says. Rate limiting is what actually defends enumeration. **The reset path
   keeps its non-disclosure guarantee** (FR-327), where the outcome genuinely is identical.

3. **Verification gates discoverability — and only that** (FR-324, FR-325, FR-359). *Revised at the
   spec review.* Originally verification gated nothing. Three separately-sound decisions — public
   join code, verification gating nothing, profiles visible to co-attendees — compounded into a route
   by which **anyone could sign up under an address they do not own and appear in a professional
   directory as that person**. Gating discoverability closes that at its only consequential exit
   while keeping sign-up in one sitting, which matters while the mail provider is unprovisioned.

4. **`StorageService` is server-side** (research D3), despite v2.3.0 listing it "alongside" the six
   client device capabilities. *Why*: the client-side reading requires signed URLs and puts vendor
   credentials adjacent to the bundle, against Principle VIII. Read as binding on the discipline, not
   the package. **A reviewer may disagree with this reading** — it is the one place the plan departs
   from a literal reading of the constitution.

5. **Per-action throttle counters, and reset-request never denies on the identifier** (research D2).
   *Why*: 001's no-lockout guarantee rests on verifying the credential *before* consulting the
   throttle. Three of the four new unauthenticated routes have no credential to verify first, so
   that guarantee does not transfer. Reset-request is the sharp one — an attacker spamming resets for
   your address would otherwise deny **you** your own recovery path.

6. **Two structural guards deliberately fail future features' builds** (T014, T095). *Why*:
   v2.3.0 makes deletion and export a per-feature duty, and a duty with no enforcement is exactly the
   failure mode Principle IX exists to prevent. **T014 sits in Phase 2, not with deletion** — a guard
   written after the tables it protects cannot have protected them, and later phases add six.

## Areas Needing Attention

**The scope.** This is four or five features under one number: sign-up, join, verification, recovery,
profile, avatar, discoverability, export, deletion, withdrawal, and a retention change. A four-PR
split is *proposed* in `tasks.md` and **not decided** — `speckit-spex-collab-phase-split` has not been
run. If you think the phase should have been split into separate *features* rather than separate PRs,
say so now; it is much cheaper before implementation.

**The spec was factually wrong about existing code, and planning caught it.** It specified a
**90-day** retention window for `sign_in_attempts` and assumed nothing swept. `maintenance.ts` has
swept it every **two hours** since 001. Implementing as written would have been a forty-fold
regression in retention of pseudonymous personal data. FR-381–FR-384 were rewritten to protect the
existing window. **Worth checking whether anything else in the spec assumes code that does not exist**
— this one was found by reading, not by a gate.

**Register entry 19 is opened here and closed by nothing.** Public self sign-up plus image upload,
with no administrative actor by construction, and the organizer-administration exclusion is precisely
what forecloses the usual answer. The product will accept any image any person uploads and show it to
co-attendees. This does not block the spec; **it should block the first publicly reachable
deployment**.

**Migration `0003` is the only number available.** `0004` is spent by 005, `0005`–`0007` are reserved
by 006–008. If implementation proves one migration insufficient, **007's and 008's reservations must
be renumbered in the same change** — this feature must not silently take a number another phase holds.

**`sign_in_attempts` is deliberately not deleted on account deletion**, in a feature whose point is
complete deletion. It has no foreign key by design, and deleting a departing attendee's rows would
let an attacker clear their own trail by registering and deleting an account. If you think this is
wrong, it is a genuine trade-off, not an oversight.

**Seeded profiles sit against 005's recorded reasoning** for seeding no attendee-authored data.
Resolved on the basis that the concern is fabricating data attributed to a *real* identity, and the
seeded accounts are fixtures — with a third bare attendee added so the empty states stay reachable at
first run.

## Open Questions

Recorded rather than resolved, per Principle I. None blocks implementation.

1. **The transactional email provider** (entry 18) — the one open entry that can leave a *shipped*
   surface non-functional rather than merely unproven.
2. **The object-storage provider** (entry 11) — kept off the critical path by the local adapter.
3. **Avatar moderation** (entry 19) — see above.
4. **Which data-protection regime applies** — deliberately not a blocker; the obligations are built
   to the strict standard so settling it is not a precondition.
5. **Client validation of desktop and tablet layouts** — open since 001, now extended to the
   product's first unauthenticated surfaces beyond sign-in.
6. **Whether 24 hours and 1 hour are right** for verification and reset link lifetimes.
7. **Where the account surfaces belong in the shell's navigation** — not a sixth destination; exactly
   where is better answered against the built shell.
8. **Hard deletion gets harder in 007 and 009**, where a deleted attendee's content sits in other
   people's threads and sessions.

## Review Checklist

- [ ] The **roadmap departure** is one you accept, or you have said so before implementation starts
- [ ] Migration `0003` is not renamed, and no second migration silently takes 007's or 008's number
- [ ] `sign_in_attempts` retention is **still two hours** — not lengthened by any task
- [ ] Every new route declaring `:eventId` carries `requireEventAccess`, and the route audit **runs**
- [ ] `POST /events/join` correctly does **not** declare `:eventId`
- [ ] The four unauthenticated routes are an explicit enumerated allow-list, each rate-limited
- [ ] A reset request cannot be used to deny an attendee their own recovery (research D2)
- [ ] A throttled reset still returns `202` — no account-existence oracle
- [ ] Profile refusals are identical across all four causes; verification state is never observable
- [ ] Stored avatar bytes carry **no EXIF** — verified against storage, not the upload path
- [ ] Account deletion leaves **zero rows**, asserted by direct database query, with no tombstone
- [ ] The avatar's storage object is deleted **before** the attendee row
- [ ] T014 and T095 (the structural guards) genuinely fail when a table or field is added uncovered
- [ ] No storage or mail vendor is imported outside `apps/api/src/storage/` and `apps/api/src/mail/`
- [ ] `CatalogRepository` gained no create, update or delete method
- [ ] `home/registry.ts` is untouched — 004 contributes no card
- [ ] `routes/index.ts` is **appended to**, never reordered
- [ ] Escape closes the delete-account dialog, focus is trapped, and returns to the opener
- [ ] No horizontal scrolling at 320 px on any new surface
- [ ] Every Feature Declarations row traces to at least one task
- [ ] The prototype's photographs of real people ship as **no attendee's** seeded avatar
