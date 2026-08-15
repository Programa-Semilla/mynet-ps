# Implementation Plan: Attendee Identity, Personal Data and Profile

**Branch**: `spec/004-attendee-identity-and-profile` · **Date**: 2026-08-07 · **Spec**: [spec.md](./spec.md)

**Constitution**: v2.3.0 · **Migration**: `0003` · **Input**: 97 functional requirements, 13 success
criteria, 8 user stories

## Summary

A person becomes an attendee under their own power, describes themselves, and can leave. Self-serve
sign-up, conference join by code, email verification, password recovery, own-profile authoring,
avatar upload, account deletion, personal-data export, and withdrawal from a conference.

Three things shape the whole plan and none of them is a feature:

1. **The retention clock already exists.** `maintenance.ts` has swept hourly since 001. The spec
   assumed otherwise and specified a 90-day window; implementing it would have lengthened retention
   of pseudonymous personal data forty-fold. The spec was corrected during planning (research D1).
2. **001's throttle contains an explicit prohibition on lockout paths**, and its no-lockout guarantee
   rests on verifying the credential *before* consulting the throttle. Three of this feature's four
   new unauthenticated routes have no credential to verify first, so that guarantee does not
   transfer — and reset-request is a new lockout surface aimed squarely at the victim (research D2).
3. **`ON DELETE CASCADE` already covers nearly everything.** Deletion is mostly one row. The
   interesting case is the single record no foreign key can reach: the avatar's bytes (research D10).

## Technical Context

**Language**: TypeScript. **Runtime**: Node (Fastify API), React PWA client.
**Storage**: PostgreSQL via Drizzle, versioned migrations.
**Testing**: Vitest (unit, component, integration), Playwright (e2e, accessibility).
**Project type**: web — `apps/api` + `apps/web`, shared `packages/*`.

**Unknowns**: none remaining. Research resolved eleven; three register entries remain open and none
blocks implementation — the mail provider (18) and object-storage provider (11) are both kept off the
critical path by an interface with a working local adapter, and avatar moderation (19) is opened by
this feature and closed by nothing in it.

## Global Constraints

- **Append, never insert.** `routes/index.ts` is append-only (the generated contract lists paths in
  observation order). Repository interfaces go in **new files** under
  `packages/data/src/interfaces/`, so 004 and 006 contend only on one export line each.
- **Every route carries a `schema` block.** A route without one is silently absent from the generated
  contract, and `contract:check` cannot notice what was never offered to it.
- **Every route declaring `:eventId` carries `requireEventAccess`.** The route audit fails the build
  otherwise. `POST /events/join` deliberately avoids `:eventId` for this reason (contract).
- **No write path to the catalog.** `CatalogRepository` is read-only in perpetuity.
- **No card is added to Home.** The roadmap assigns 004 none.
- **One migration, `0003`.** No adjacent number is free.

## Interfaces

| Interface | Location | Notes |
|---|---|---|
| `StorageService` | `apps/api` | **Server-side**, not a seventh `DeviceServices` member (research D3). Three methods; DB-backed adapter for dev/test/preview needing no provisioning. |
| `MailService` | `apps/api` | Transactional account mail only. Must not be usable for engagement notifications (FR-395). Dev/test adapter writes to a sink. |
| `IdentityRepository`, `ProfileRepository` | `packages/data/src/interfaces/` | New files. |

`CameraService` stays unwired (research D9), and that is recorded rather than left looking like an
oversight.

## Constitution Check

### Before design

| Principle | Assessment |
|---|---|
| I — Requirements define the product | Pass. Every capability traces to `requirements.md` or to a v2.3.0 decision. |
| II — Prototype is reference | Pass. Nothing carried forward; the prototype has no sign-up, profile or deletion surface. |
| III — Attendee experience first | Pass, and closely examined. Self sign-up is the only identity model leaving the attendee sole actor; a join code on a seeded row is seed data, not an administrator. No admin interface, no privileged role, no import path. |
| IV — Accessibility and responsiveness | Pass by declaration; three layouts, Escape and focus return on the delete confirmation, disabled confirmations that state *why*. |
| V — Abstraction before platform and data APIs | Pass. Two new ports; no vendor SDK in feature code. The file input is not a platform API call (D9). |
| VI — Web-first delivery | Pass. Nothing this feature adds works offline, declared explicitly; no write queue, no optimistic update. |
| VII — Verified on Linux CI | Pass with a known limit. Correctness gates all run; `0003` is verified against a real database. Preview path stays red — entry 17's remainder. |
| VIII — Attendee data is personal data | **The centre of this feature.** Identity from the session only; three-condition profile read enforced server-side; refusals indistinguishable by construction; deletion hard and cascading; export complete; retention protected rather than rebuilt. |
| IX — Every feature declares completeness | Pass. All twelve declarations filled, including the new deletion-and-export coverage row. |

**Gate: PASS.** No violation to justify; Complexity Tracking is empty.

### After design — re-evaluated

Design introduced no new violation, and three points deserve recording because they were close calls:

- **`StorageService` placement contradicts a literal reading of v2.3.0**, which lists it "alongside"
  the six device capabilities. Resolved as binding on the discipline rather than the package, because
  the client-side reading would put vendor credentials adjacent to the bundle and breach Principle
  VIII's "secrets never reach the client". Recorded in research D3 rather than decided silently.
- **Seeding profiles sits against 005's recorded reasoning** for seeding no attendee-authored data.
  Resolved: the concern is fabricating data attributed to a *real* identity, and the seeded accounts
  are fixtures. A third bare attendee preserves 005's actual benefit — empty states reachable at
  first run (research D6).
- **`sign_in_attempts` is deliberately not deleted on account deletion**, which looks like a gap in a
  feature whose point is complete deletion. It is not: the table has no foreign key by design, and
  deleting a departing attendee's rows would let an attacker clear their own trail by registering and
  deleting an account. It expires on the sweep instead (D10).

**Gate: PASS.**

## Project Structure

### Documentation (this feature)

```
specs/004-attendee-identity-and-profile/
├── spec.md
├── plan.md                      # this file
├── research.md                  # D1–D11
├── data-model.md
├── quickstart.md
├── contracts/identity-api.md
└── checklists/requirements.md
```

### Source Code

```
apps/api/src/
├── auth/
│   ├── sign-up.ts                    # new
│   ├── verification.ts               # new — token issue/consume (D4)
│   ├── password-reset.ts             # new
│   └── throttle.ts                   # EDITED — per-action counters (D2)
├── storage/
│   ├── service.ts                    # new — the port (D3)
│   └── db-adapter.ts                 # new — dev/test/preview
├── mail/
│   ├── service.ts                    # new — the port
│   └── sink-adapter.ts               # new
├── images/avatar.ts                  # new — decode, resize, re-encode (D8)
├── db/schema/
│   ├── attendees.ts                  # EDITED — three columns
│   ├── events.ts                     # EDITED — join_code
│   ├── sign-in-attempts.ts           # EDITED — action
│   ├── profiles.ts                   # new
│   ├── identity-tokens.ts            # new
│   └── stored-objects.ts             # new
├── db/queries/{profiles,identity,account}.ts   # new
├── db/seed/{attendees,events}.ts     # EDITED — profiles, third attendee, join codes
├── routes/
│   ├── auth/{sign-up,verify,reset}.ts          # new
│   ├── profile.ts, account.ts                  # new
│   └── events/{join,registration,attendees}.ts # new
├── routes/index.ts                   # EDITED — appended
└── maintenance.ts                    # EDITED — sweep new expirables (D1)

apps/web/src/
├── app/auth/{SignUp,Verify,ResetRequest,ResetPassword}.tsx   # new
├── app/join/JoinConference.tsx                               # new
├── app/profile/{Profile,ProfileEdit,Avatar,Account}.tsx      # new
└── app/navigation.ts                 # EDITED — destinations declare their own addresses

packages/data/src/
├── interfaces/{identity,profile}.ts  # new
├── interfaces/index.ts               # EDITED — two appended exports
└── http/{identity,profile}-repository.ts   # new
```

## Phase status

| Phase | Status |
|---|---|
| 0 — Research | **Complete.** D1–D11; eleven unknowns resolved; one spec correction applied. |
| 1 — Design & contracts | **Complete.** data-model.md, contracts/identity-api.md, quickstart.md. |
| 2 — Tasks | Not started. `/speckit-tasks`. |

## Complexity Tracking

Empty. No constitutional violation requires justification.

The feature's **size** is not a complexity violation but is recorded here for the phase split: it
spans nine capability clusters, two new ports, six new tables plus three altered ones, and both
applications. The natural seams, in dependency order — sign-up and join; verification and recovery;
profile and interests; avatar and storage; discoverability; export and deletion — are offered to
`speckit-spex-collab-phase-split` rather than decided here, because they are easier to judge against
a concrete task list.
