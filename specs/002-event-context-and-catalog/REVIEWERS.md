# Review Guide: Event Context, Session Catalog & Home Composition

**Generated**: 2026-08-06 | **Spec**: [spec.md](spec.md)

> **Read this first.** This feature **departs from the delivery roadmap**: it absorbs phase 003
> entirely, taking its reserved migration `0002` with it. That was an owner decision recorded in
> [brainstorm/02](../../brainstorm/02-event-context-and-catalog.md), and the departure is documented
> in the spec because the roadmap requires a departing feature to say so. If you review this against
> the roadmap's phase table, it will look wrong. Review it against the spec's "Departure" table.

## Why This Change

MyNet's five destinations exist and an attendee can sign in, but **nothing in the product carries
conference content**. Home lists the events an attendee is registered for and nothing else; Agenda,
Discover, Messages and Network are placeholders. The product cannot yet answer the first and most
prominent of the attendee's three questions — *what is happening next?*

Two further things are missing that everything after this depends on. There is no notion of an
**active event**, so a multi-event product has no way to say which conference an attendee is looking
at. And Home has no **composition contract**, so the seven features that each want to contribute a
card to it would contend for one file and, worse, each invent their own answer to what a card may
assume and how it fails.

## What Changes

An attendee signs in and lands on the conference happening today without choosing anything, greeted
by name and told which day of it today is — computed in the **venue's** timezone, so it is right for
an attendee in another one. They see the next session and what remains of the day on Home, and the
whole programme in Agenda. They can switch conference from the top bar at any width, and everything
conference-specific follows; the choice survives sign-out and a change of device.

Underneath, three things are established that later features inherit: a **server-side scoping
predicate** that makes it structurally difficult to read another event's content, a **Home card
registry** where each contribution declares its placement and its scoping rule and cannot take the
dashboard down when it fails, and a **split of three shared files** into per-domain modules so later
features append rather than edit.

**No breaking changes to existing behaviour.** Sign-in, identity binding, the responsive shell and
`GET /events` are untouched. **No new personal data is stored** — the catalog is seeded conference
content and the active-event selection is a workspace preference.

## How It Works

**Active event.** A new `active_event_selections` table, keyed by attendee, whose **composite foreign
key into `registrations`** means the row cannot name an event the attendee is not registered for, and
disappears by cascade when the registration does. While no row exists, the active event is **derived
in SQL** — in progress today in the venue's timezone, else next upcoming, else most recently ended,
with a total order (`starts_on`, `ends_on`, `id`) so two devices never disagree. Once the attendee
switches, the choice is recorded and honoured indefinitely.

**Scoping.** Per-event requests name their event in the path. A `requireEventAccess` preHandler
verifies registration and produces a branded **`EventScope`** value that only it can construct; every
per-event query function takes `EventScope` rather than a string, so a handler that skipped
verification does not compile. A **route audit test** walks the built Fastify route table and fails
when a route declaring an event parameter lacks the guard. Refusals for an unregistered event are
byte-identical to those for a nonexistent one.

**Home composition.** A `HomeCard` union **discriminated on `scope`**: an event-scoped card's
component requires the resolved event as a prop, an attendee-scoped card's cannot accept one. The
shell — not each card author — supplies the error boundary, groups by named slot (`lead`, `primary`,
`aside`), and maps slots to the three widths in one place. Cards register by appending one line to
`apps/web/src/app/home/registry.ts`.

**Catalog.** Five tables (`tracks`, `rooms`, `speakers`, `sessions`, `session_speakers`), all
per-event, read-only, seeded. Session times are absolute instants so relative wording is computed at
display; tracks carry a **theme token name**, never a colour value.

Two migrations: `0001` for event context, `0002` for the catalog. Full reasoning in
[research.md](research.md); schema in [data-model.md](data-model.md).

## When It Applies

**Applies when**:

- An attendee is signed in and registered for at least one event
- Any surface needs to know which conference the attendee is working in
- A later feature contributes a card to Home, or reads per-event content

**Does not apply when**:

- Saving a session, taking notes, or asking a question — read-only here; 005 and 009
- Anything about people: profiles, Discover, messages, contacts, cards, appointments — 004 and 006–008
- Reading the programme offline — nothing is cached, deliberately; the staleness policy is an open
  question, and the constitution requires it to be decided rather than assumed
- Adding or editing conference content — no write path at any privilege, and no import path.
  Organizer administration is out of product scope

## Key Decisions

1. **Per-event requests name their event explicitly, and the server verifies registration.**
   *Alternative rejected*: resolving the active event implicitly from server state, which would have
   kept 001's rule that no endpoint accepts *any* identifier. *Why*: self-describing requests are
   cacheable and independently verifiable, and hidden request state forbids two events in two tabs.
   *The cost*: it weakens a structural guarantee, which is why decisions 2 exists to pay it back.

2. **Enforcement is both compile-time and CI-time.** A branded `EventScope` the query layer requires,
   *and* a route-table audit. *Alternative rejected*: a guard preHandler alone, following the shipped
   `requireAttendee` pattern — familiar, but enforced only at test time, and covering routes without
   covering the query layer. *Known limit, stated rather than glossed*: a type assertion defeats a
   brand, so an ESLint rule rejects assertions to `EventScope` outside its defining module.

3. **A card declares its scoping rule.** *Alternative rejected*: an ambient `useActiveEvent()` hook
   with one card kind. *Why*: with a discriminant, the compiler distinguishes a card that legitimately
   ignores the event from one that forgot to handle its absence, and an event-resolution failure
   degrades only the event-scoped half of Home.

4. **Named slots rather than a weighted list.** *Alternative rejected*: a flat array with a numeric
   weight. *Why*: "must be in the first viewport" needs to be expressible, not implied by a number,
   and the slot-to-width mapping then lives in one place instead of in each card.

5. **The conference day uses the venue's timezone; the greeting's time of day uses the device's.**
   *Alternative rejected*: the device date for both. *Why*: which day of a conference it is, is a
   fact about the conference; whether it is morning is a fact about the attendee.

6. **An explicit choice is honoured indefinitely, even after its event ends.** *Alternative
   rejected*: re-deriving once the chosen event has finished. *Why*: an attendee who deliberately
   returned to a past conference to re-read something should not be moved off it.

7. **Absorbing phase 003.** *Alternative rejected*: keeping the roadmap boundary, explored across
   four rounds. *Why*: every smaller version left either the scoping predicate or the card contract
   proven by shape rather than by use — the same failure recorded in the 001 review as
   `substitutability-proven-without-the-application`.

## Areas Needing Attention

**The single-lead rule is not a compile-time guarantee.** FR-157 says at most one card may occupy the
most prominent slot. Enforcing that in the type system over an append-only array would make the
registry hostile to the append it exists for, so it is a unit test plus a development assertion.
Reasonable people may want it stronger.

**Explicit event identifiers weaken 001's cleanest structural property.** The shipped interface file
carries a prominent note that no method accepts an identifier, *because the absence is the
mechanism*. This feature reintroduces an identifier for events specifically. The compensating
machinery is real, but it is machinery — worth pushing on whether it is enough.

**This is the largest feature in the delivery plan**, at 89 tasks across 8 phases, and the spec
records the intent as a **single squash-merged pull request**. That was reaffirmed by the owner after
the catalog was absorbed. If that looks like too much for one review, the natural seam is after User
Story 1: Phases 1–3 are a coherent increment, and US2 onward is the catalog.

**Desktop and tablet layouts have never been validated by the client.** The approved prototype is
mobile-only at a fixed 390×844. This feature builds Home's dashboard *and* Agenda's programme at
widths nobody has reviewed, and the roadmap's review gate — scheduled for "after 002–003" — now falls
after this feature alone. The cost of getting it wrong compounds with every later feature.

**Two of this feature's guarantees are enforced only by CI, and CI has never run on `develop`.** The
route audit and the isolation suite are both pipeline-only. Until runs actually start, `pnpm
verify:clean` locally is the only place they are checked, which is why quickstart.md makes running it
before opening the PR non-optional.

**Speakers are per-event, so the same human at two conferences is two unlinked rows.** That follows
from the constitution's hybrid scoping rule and is accepted, but it is a real modelling consequence
that feature 004 must not assume away when attendee profiles arrive.

## Open Questions

Five, recorded in the spec rather than resolved, per Principle I:

1. **Client validation of desktop and tablet layouts** — open since 001, escalated by this feature.
2. **Offline staleness policy for conference content** — this feature caches nothing, which makes the
   question concrete without answering it.
3. **Whether an explicit event choice should ever expire** — decided as "never" here, with the
   rejected alternative recorded so it can be revisited cheaply.
4. **Whether the enlarged scope still wants a single pull request** — the phase-split step will put
   this again against the concrete task list.
5. **What "PS" denotes** in the repository name, and the repository-visibility entry — unchanged by
   this feature.

## Review Checklist

- [ ] Key decisions are justified
- [ ] Breaking changes are documented with migration guidance
- [ ] Scope matches the stated boundaries
- [ ] Success criteria are achievable
- [ ] No unstated assumptions

Feature-specific, because these are where this change can go quietly wrong:

- [ ] The roadmap departure is acceptable, and the knock-on effects are right: 003 retired, `0002`
      transferred, 005 now depends on 002, first free pair is 005 ∥ 006
- [ ] Every new table states which scoping rule applies **and why** — neither rule is a default
- [ ] No route reads conference content without verifying registration, and the audit would actually
      catch one that did
- [ ] An unregistered event and a nonexistent one are genuinely indistinguishable in the response
- [ ] No colour value appears in the database, in a component, or in seed data
- [ ] `dayNumber` / `totalDays` appear nowhere in the schema or the contract
- [ ] Every card renders a visible state in all four of loading, populated, empty and failed
- [ ] Accessibility and responsive work lives inside the story phases, not in Phase 8 — Principle IX
      forbids deferring it to a consolidated pass

---

<!-- Code phase sections are appended below this line by the phase-manager command -->
