# Implementation Plan: Network — Contacts, Exchanged Cards, and Appointments

**Branch**: `feat/008-network-and-appointments` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-network-and-appointments/spec.md`

## Summary

Fill the fifth and last empty destination. **A contact is someone whose digital business card you
hold** — sharing a card is the only relationship-forming act in the product, it is one-directional,
and a held card resolves the sharer's *live* profile under a standing consent that outlives both the
event and the discoverability toggle. Appointments are per-event, proposed then accepted or
declined, over a seeded slot grid whose availability is a function of the reader's own commitments
alone.

The technical shape follows from two facts established in research. **Cards are cross-event and
therefore invisible to the event-scope audit**, so they get a third branded scope and a third route
audit mirroring what 007 built for conversations. **Appointments are per-event**, so registering
them beneath `/events/:eventId` puts them inside the guarantee that already exists — no new
machinery. That split is the plan's central decision, and it is the opposite of what 007's own
comments predicted.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22 (API) and React 19 (client), as shipped.

**Primary Dependencies**: Fastify + Drizzle over PostgreSQL 17 (API); React + React Router, built as
an installable PWA (client). **This feature adds no dependency** — no new package, no vendor, no
external service.

**Storage**: PostgreSQL. Migration `0007` adds `shared_cards`, `appointments`, `meeting_slots`.

**Testing**: Vitest for unit, component, contract and integration (against a real `postgres:17`
service container); Playwright for e2e and accessibility.

**Target Platform**: Installable PWA on evergreen browsers; API in a container behind Caddy.

**Project Type**: Web application — pnpm workspace with `apps/api`, `apps/web`, and shared packages.

**Performance Goals**: Availability resolution is one query. The contacts list is bounded by
deliberate human acts, so no keyset pagination is planned (spec Assumptions) — stated so the
assumption is visible if it proves wrong.

**Constraints**: No content or primary action may require horizontal scrolling at any width. Writes
are refused offline, never queued. No notification may be dispatched from this feature.

**Scale/Scope**: Two API domains, two new repositories, one destination with two views, one Home
card, one modal, three tables. Comparable to 006 in surface and smaller than 007.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Checked against v3.2.0**, which is on `docs/unblock-008-network-and-appointments` and not yet
merged. **This is a real precondition, not a formality**: the owner ruled on 2026-08-10 that entries
7 and 8 close by amendment, so **implementation may not begin until that branch merges**. Planning
against it is legitimate; building against it is not.

| Gate | Status | Evidence |
|---|---|---|
| **I — Requirements define the product** | ✅ | Every decision traces to `requirements.md`'s WHAT (Network brings together contacts, exchanged cards, appointments) or to a recorded owner decision. No open question is resolved by inference. |
| **II — Prototype is reference, not architecture** | ✅ | Four prototype behaviours are deliberately not reproduced, each with a reason in the spec: contacts derived from conversations (now *forbidden* by v3.2.0), transient card confirmation, hardcoded `MEETING_SLOTS`, unilateral appointment creation. Its missing Escape and focus states are corrected. |
| **III — Attendee experience first** | ✅ | The attendee remains the only actor. The slot grid is seeded conference content with **no** interface to create or edit it, so it opens no route around the organizer exclusion. |
| **IV — Accessibility and responsiveness** | ✅ | Declared per layout in the spec. Modal dialogs via `showModal()` with focus restored to the opener *after* closing; `ConfirmDialog` reused for decline and cancel rather than a second modal (FR-655, FR-656). Contacts/appointments is a segmented control, never a horizontally scrolling strip (FR-659). |
| **V — Abstraction before platform and data APIs** | ✅ | Two new repository interfaces in domain terms; no component calls the network. **No new device capability is required**, so Principle V's list of seven is unchanged — worth stating, because 007 had to amend the constitution to add one. |
| **VI — Web-first, offline declared** | ✅ | Appointments cached under the existing key; contacts refused, declared per member at the composition root; every write refused rather than queued (FR-647–FR-649). No Capacitor trigger is met. |
| **VII — Verified on Linux CI** | ✅ | No new gate needed. The three new tables and two new route families are covered by existing audits plus the one new audit R1 requires. |
| **VIII — Attendee data is personal data** | ✅ | Server-side authorization on every read and write; refusals never disclose that a relationship exists; cascade coverage on all four attendee references. **Two Principle VIII findings are structural rather than incidental**: slot availability must disclose nothing about the invitee (a leak *by omission*, now forbidden by v3.2.0), and the contact line was withdrawn as a per-field audience. |
| **IX — Every feature declares its own completeness** | ✅ | The spec's Feature Declarations table is complete, every row filled, nothing deferred to a polish pass. |

**No violations. Complexity Tracking is therefore omitted.**

Two constitutional obligations are discharged by this feature that are worth naming, because they
have been outstanding for the life of the project: the whole-product checklist items **digital-card
sharing feedback** and **meeting scheduling and appointment creation** — the last two behavioural
items still open before 010.

### Re-check after Phase 1 design

**Re-evaluated 2026-08-10 against the data model, contracts, and quickstart. Still passing, with
two design decisions that strengthen rather than strain a gate:**

- **Principle VIII is *more* satisfied than the spec required.** The availability query takes only
  reader-keyed inputs (research R10), which makes SC-608a's guarantee structural — a later `AND`
  against invitee state would have to be added deliberately rather than being possible by accident.
- **Principle V is untouched**, confirmed against the design: no browser API is reached, so no
  eighth capability and no amendment. The contrast with 007 is deliberate and recorded.

One item moved from "assumed" to "designed": blocking writes into appointments, which is the single
place 008 edits a file 007 owns (research R6). It is one call in `db/queries/blocks.ts`, and the
alternative — read-time filtering — was rejected because lifting a block would resurrect a cancelled
meeting, which FR-637a forbids.

## Project Structure

### Documentation (this feature)

```text
specs/008-network-and-appointments/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── network.md
├── checklists/
│   └── requirements.md  # 16/16, spec review gate passed
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
apps/api/
├── migrations/
│   └── 0007_network_and_appointments.sql   # NEW — three tables and their indexes
├── src/
│   ├── db/
│   │   ├── schema/
│   │   │   ├── cards.ts                    # NEW — shared_cards
│   │   │   └── appointments.ts             # NEW — appointments, meeting_slots
│   │   ├── queries/
│   │   │   ├── cards.ts                    # NEW
│   │   │   ├── appointments.ts             # NEW — incl. the cancel-on-block entry point
│   │   │   └── blocks.ts                   # EDITED — one call (research R6)
│   │   └── seed/
│   │       └── network.ts                  # NEW — the meeting-slot grid
│   ├── plugins/
│   │   ├── card-access.ts                  # NEW — CardScope + requireHeldCard
│   │   └── participation.ts                # EDITED — comment correction only
│   └── routes/
│       ├── cards.ts                        # NEW — cross-event, names no conference
│       └── events/appointments.ts          # NEW — beneath :eventId, deliberately
└── tests/
    ├── unit/
    │   ├── card-audit.test.ts              # NEW — the third route audit
    │   ├── deletion-coverage.test.ts       # EDITED — meeting_slots allow-list + reason
    │   └── participation-audit.test.ts     # EDITED — comment correction only
    └── integration/                        # NEW — cards, appointments, availability, blocking

apps/web/src/app/
├── navigation.ts                           # EDITED — Network entry only
├── home/
│   ├── registry.ts                         # EDITED — one import, one entry
│   └── cards/Appointments.tsx              # NEW
├── destinations/Network.tsx                # NEW
└── network/                                # NEW — contacts, appointments, scheduling dialog

packages/data/src/
├── interfaces/{cards,appointments}.ts      # NEW
└── http/{cards,appointments}.ts            # NEW

packages/platform/src/interfaces/index.ts   # EDITED — two lines on Repositories
```

**Structure Decision**: the shipped workspace layout, extended only through its declared
append-only points. Every file marked EDITED above is either a one-line registry append or a comment
correction, with the single exception of `db/queries/blocks.ts`, which gains one call and is
justified in research R6. **No neighbouring feature's component, card, or test is modified.**

The route split is the structurally significant choice and it is not cosmetic: `routes/cards.ts`
names no conference **because cards are cross-event**, which is precisely why it needs the new audit;
`routes/events/appointments.ts` sits beneath `:eventId` **because appointments are per-event**, which
is what puts it inside the audit that already exists.
