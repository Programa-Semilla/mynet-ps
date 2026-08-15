# Research: Attendee Identity, Personal Data and Profile

**Feature**: 004 · **Date**: 2026-08-07 · **Constitution**: v2.3.0

Decisions taken while grounding the specification in the code that already exists. Several of them
changed the specification, which is recorded here and in the spec itself rather than applied quietly.

---

## D1 — The retention clock already exists, and the spec was wrong about it

**Decision**: Do not build a retention clock. Extend the one that runs.

**What was found**: `apps/api/src/maintenance.ts` registers an hourly sweep, seeded by a boot-time
run 30 seconds after start, calling `pruneAttempts()` and `pruneSessions()`. `pruneAttempts` deletes
`sign_in_attempts` older than **two hours**; `pruneSessions` deletes `auth_sessions` ended more than
30 days ago. Both have run since 001. The file's own header records that these functions existed
before it and that nothing called them — a gap 001 closed.

**Why it changed the spec**: the draft required a clock to be built and assumed a **90-day** window
for `sign_in_attempts`. Implementing that as written would have *lengthened* retention of
pseudonymous personal data from two hours to ninety days — a forty-fold regression, in the one table
holding keyed hashes of every address ever typed at the service including non-attendees. FR-381–384
were rewritten: protect the existing window, never lengthen it, and add anything new to the same
sweep in the same change.

**Alternatives considered**: adding a second sweep for 004's records (rejected — two schedulers where
one exists is how one of them stops being maintained); a cron/external scheduler (rejected — the
in-process `unref()`'d timer needs no infrastructure and the work is one indexed `DELETE`).

---

## D2 — Throttling the four new unauthenticated routes, without recreating the lockout 001 eliminated

**Decision**: Add an `action` discriminator to the attempt record, count each action separately, and
**never let a reset request produce a denial keyed on the identifier**.

**What was found**: `apps/api/src/auth/throttle.ts` carries an explicit prohibition —
*"THERE IS NO LOCKOUT PATH IN THIS FILE, AND THERE MUST NEVER BE ONE"* — because email is the
identifier, so a lockout lets anyone deny an attendee access by typing their address wrong enough
times. SC-003a requires the number of accounts an attacker can render permanently inaccessible to be
**zero**. Two mechanisms make that true: the delay is *outstanding-time-based* rather than
streak-based, and **the credential is verified before the throttle is consulted**, so a correct
password is never refused.

**The problem this feature creates**: that second mechanism does not transfer. Sign-up, join-code
entry and reset-request have no credential to verify first, so the throttle must gate them. For
reset-request that is a genuine new lockout surface: an attacker spamming reset requests for a
victim's address could deny that victim the ability to reset their password — which is FR-031b's
failure in a new place, reached by a different route.

**Resolution, three parts**:

1. **Separate counters per action** (FR-307a). One `action` column on the attempt record; every
   count filters on it. Without this, a sign-up storm against an address inflates the identifier
   streak and slows that address's *sign-ins* — and a source-dimension storm is worse, because the
   source count deliberately does **not** reset on success.
2. **Reset-request throttling is source-weighted, and identifier-keyed throttling of it may delay
   but MUST NOT deny.** The person who suffers an identifier-keyed denial is always the victim, never
   the attacker.
3. **The reset response is already identical either way** (FR-327), so a throttled reset request must
   return the same response as an unthrottled one, or the throttle becomes the account-existence
   oracle that FR-327 exists to close.

**Alternatives considered**: a separate table per action (rejected — four tables to sweep, four
schemas to keep aligned, and the existing sweep already covers one); reusing the counter unmodified
(rejected — it is the lockout, reintroduced).

---

## D3 — `StorageService` is server-side, in `apps/api`, not in `packages/platform`

**Decision**: The storage port lives in the API. It is not a seventh member of `DeviceServices`.

**Reasoning**: constitution v2.3.0 lists `StorageService` "alongside" the six device capabilities,
but those six live in `packages/platform` and are **client** capabilities — things a browser or a
device can do. Avatar bytes are received, stripped, resized and stored by the **server**. Putting the
port in `packages/platform` would mean the client writes to storage directly, which needs signed
URLs and puts vendor credentials adjacent to the client bundle — against Principle VIII's "secrets
never reach the client".

The constitutional text is read as binding on the **discipline** — a project-owned interface, no
vendor SDK called from feature code — not on the package. `packages/platform/src/interfaces/index.ts`
opens by saying the six names "are fixed by the constitution and are not open to restyling", and
`DeviceServices` enumerates exactly six; adding a seventh member there would contradict both that
file and the constitution's own separate listing.

**Shape**: `put(key, bytes, contentType)`, `get(key)`, `delete(key)`. The development, test and
preview implementation is database-backed — a `bytea` column in a table owned by the storage adapter
— because it needs no filesystem that survives a container restart and no provisioning at all, which
is what FR-352 demands. The production adapter (entry 11) swaps behind the same three methods.

**Alternatives considered**: filesystem-backed dev adapter (rejected — Fly machines have ephemeral
disks and preview environments are recreated per PR, so it would appear to work and then lose
avatars); storing bytes on the profile row directly (rejected — it defeats FR-352's whole purpose,
which is that the vendor swap touches one adapter).

---

## D4 — Verification and reset tokens reuse 001's opaque-token pattern exactly

**Decision**: `randomBytes(32).toString('base64url')`, SHA-256 hashed at rest, single-use, compared
in constant time. Do not invent a second token scheme.

**Reasoning**: `apps/api/src/auth/token.ts` already does precisely this for sign-in sessions and
records why SHA-256 rather than Argon2id is correct for a 256-bit random value: there is nothing for
a slow hash to defend against, and the cost would be paid on every request. Verification and reset
tokens have identical properties. `tokenHashesEqual` already exists for constant-time comparison.

This satisfies FR-323 and FR-333 — database access alone does not permit a link to be reconstructed —
by the same argument that already holds for sessions, rather than by a new one.

**Consequence for FR-329** (issuing a new reset link invalidates the outstanding one): enforced by
deleting outstanding rows for that attendee inside the same transaction that inserts the new one, not
by an `is_current` flag. A flag would leave the superseded row usable if a read forgot to check it.

---

## D5 — Profile reads are conference-scoped **routes** over cross-event **data**

**Decision**: A profile read for another attendee is `GET /events/:eventId/attendees/:attendeeId`,
carrying `requireEventAccess`. The attendee's own profile is `GET /profile`, with no event in the
path.

**Reasoning**: this is what makes FR-357 structural rather than remembered. `requireEventAccess`
produces a branded `EventScope` that only that module can construct — nominal via a `#private` field,
plus `WeakSet` membership so the *value* cannot be laundered by spread, `Object.assign`,
`structuredClone`, or reconstruction through the prototype's constructor. Every per-event query
demands one. Declaring `:eventId` also brings the route audit into play, which **fails the build**
when a route carrying a conference identifier lacks the guard.

So the reader's registration is proven by the existing machinery. The **target's** registration is
then a `WHERE` on `registrations` filtered by the scope's `eventId` — one query, one join, so
"not registered for this conference", "does not exist", "not discoverable" and "not verified" all
produce no row and are therefore indistinguishable **by construction** rather than by four careful
call sites. That is FR-361 obtained the same way 002 obtained FR-148.

**The scoping declaration is unaffected**: the profile row itself is cross-event and is not
duplicated per conference. The event in the path is an authorization predicate, not a partition key.

---

## D6 — Seeded demo attendees get profiles; 005's no-seeded-personal-data reasoning is narrower than it looks

**Decision**: Seed profiles for the demo attendees, and add a **third** seeded attendee with no
profile and no avatar.

**The tension**: `apps/api/src/db/schema/agenda.ts` records that 005 deliberately seeded nothing,
because "seeding them would fabricate personal data attributed to a real identity", and notes the
benefit — the empty states are what a reviewer sees at first run, and empty states are the ones most
likely to be skipped.

**Why seeding profiles is still right**: the concern is fabricating data attributed to a **real**
identity. The two seeded accounts are fixtures, not people. And 006 reads a directory: shipping it
against an empty one would make the feature undemonstrable and its empty state the only state anyone
ever sees — the mirror of the problem 005 was avoiding.

**Why the third attendee**: it preserves 005's actual benefit. With two populated profiles and one
bare account, both the populated and the empty profile states are reachable at first run without
anyone constructing them.

---

## D7 — The join code lives on `events`, and is not a credential

**Decision**: A `join_code` column on `events`, `NOT NULL` with a `UNIQUE` constraint, populated by
the seed. Compared case-insensitively after trimming, like the email identifier already is.

**Reasoning**: FR-317a settles that it is not a secret, so it is stored in plain text — hashing it
would imply a confidentiality property the specification explicitly disclaims, and would prevent the
unique constraint doing its job. The comparison follows `normaliseEmail`'s existing precedent
(`trim().toLowerCase()`), because a code typed off a badge or a slide arrives with arbitrary case and
stray whitespace.

`UNIQUE` matters more than it looks: without it, two conferences could seed the same code and joining
would silently resolve to whichever row the planner returned first.

**FR-317c** (withdrawing) deletes the `registrations` row. `saved_sessions` and `session_notes`
reference `sessions`, not `registrations`, so they do **not** cascade from it — withdrawal must delete
them explicitly, scoped to that conference. This is exactly the kind of gap FR-370's structural guard
exists to catch, and it is caught here by writing it down rather than by the guard.

---

## D8 — Avatar processing happens server-side, and EXIF stripping is a re-encode

**Decision**: Decode, resize to a bounded square, and **re-encode** on the server. Do not attempt to
strip metadata in place, and do not trust the client to have done it.

**Reasoning**: FR-349 requires that what is stored carries no location, camera or timestamp data.
Selective metadata removal means enumerating the tags to remove, which fails open — a format or tag
nobody anticipated survives. A full decode-and-re-encode produces a new image from pixels alone, so
metadata absence is a property of the operation rather than a list to maintain.

Client-side stripping is rejected outright: Principle VIII says client-side presentation is never
enforcement, and a direct API call could upload anything regardless.

**Content type is determined by inspection, not by the declared header or the file extension**, and
the upload is refused before any bytes are stored if the decode fails (FR-347).

---

## D9 — `CameraService` stays unwired; the file input is not a Principle V violation

**Decision**: Avatar selection uses a file input with `accept="image/*"`, which on mobile already
offers the camera. `CameraService.capturePhoto()` remains unwired.

**Reasoning**: `packages/platform/src/interfaces/index.ts` documents `CameraService` as being "for
scanning a badge or capturing an avatar in a later slice" — this slice. But a file input is a
declarative form element, not a browser API call, so it does not engage the
`mynet/no-direct-platform-access` rule that SC-008 requires to report zero violations. A
`getUserMedia`-based capture flow would be a richer, separate capability with its own permission
states and preview surface, and no requirement asks for one.

Recorded so the unused interface does not read as an oversight.

---

## D10 — Deletion is one transaction, and the cascade does most of it

**Decision**: A single transaction deleting the `attendees` row, plus explicit deletion of the
storage object for the avatar.

**Reasoning**: `registrations`, `saved_sessions`, `session_notes`, `attendee_credentials`,
`auth_sessions` and `active_event` all already declare `ON DELETE CASCADE` from `attendees` — that is
the mechanism 005 relied on and could never trigger. Deleting the parent row discharges FR-366 for
every table in the database.

**The avatar is the exception, and it is the reason FR-370 is a requirement rather than a note.**
Storage bytes live outside the database and no foreign key reaches them. The delete must remove the
object explicitly, and it must do so in an order that cannot orphan bytes: delete the object first,
then the row, so a failure leaves a row pointing at a missing object (recoverable, renders the
fallback) rather than an object no row references (unreachable, and invisible to any audit).

`sign_in_attempts` is deliberately **not** deleted on account deletion: it has no foreign key by
design, and deleting a departing attendee's attempt rows would hand an attacker a way to clear their
own trail by registering and deleting an account. It expires on the sweep instead (D1).

---

## D11 — Export is generated synchronously, in one request

**Decision**: One authenticated request returns one JSON document.

**Reasoning**: at conference scale a single attendee's data is a profile, a handful of
registrations, some saved sessions and notes, and one image. Assembling that asynchronously would
add a job, a store for the result, a delivery path and an expiry policy for a file containing every
piece of personal data the product holds — a new personal-data surface created to avoid a query that
takes milliseconds.

**The avatar is included as a base64 data field** rather than as a URL, so the export is complete
standing alone. A URL would make the export a pointer into a system the attendee may have just
asked to be deleted from.

**FR-377's structural guard** is the interesting part: a test that fails when a personal-data field
exists without export coverage. Implemented by deriving the expected field set from the Drizzle
schema and comparing it against what the export produces, so a new column fails the test by existing.
An allow-list of deliberate exclusions (credential material, FR-376) is part of the test, so
exclusions are declared rather than silent.

---

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Where the retention clock goes | It exists; extend `maintenance.ts` (D1) |
| How to throttle four new unauthenticated routes | Per-action counters; reset never denies on identifier (D2) |
| Which package owns `StorageService` | `apps/api` — it is server-side (D3) |
| Token scheme for verification and reset | 001's opaque-token pattern, unchanged (D4) |
| How the shared-conference condition is enforced | `requireEventAccess` + one join, so refusals are indistinguishable by construction (D5) |
| Whether to seed profiles | Yes, plus a third bare attendee to keep empty states reachable (D6) |
| Where the join code lives | `events.join_code`, unique, plain text, case-insensitive compare (D7) |
| How EXIF is stripped | Server-side decode and re-encode (D8) |
| Whether `CameraService` gets wired | No, and why that is not a Principle V violation (D9) |
| What deletion must do beyond the cascade | Remove the storage object, in an order that cannot orphan bytes (D10) |
| Export delivery | Synchronous, one document, avatar embedded (D11) |

## Still open, and not resolvable here

- **The transactional mail provider** (register entry 18). D4 settles the token; nothing settles the
  transport. FR-318a keeps sign-up working without it.
- **The object-storage provider** (register entry 11). D3 settles the port and the dev adapter.
- **Avatar moderation** (register entry 19). Opened by this feature, closed by nothing in it.
